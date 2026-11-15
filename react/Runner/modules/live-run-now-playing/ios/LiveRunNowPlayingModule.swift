import ExpoModulesCore
import AVFoundation
import MediaPlayer

/**
 * iOS Lock Screen / Control Center "Now Playing" controls for a live run —
 * the equivalent of the Android MediaStyle notification driven by
 * react-native-track-player (see services/liveRunNotificationService.ts),
 * which can't be used here because it isn't New Architecture-compatible on
 * iOS. Same underlying trick as that library: a silent, looping audio
 * buffer keeps an AVAudioSession alive in the background so the OS treats
 * this app as the active "Now Playing" app, which is what makes
 * MPNowPlayingInfoCenter show up on the lock screen and
 * MPRemoteCommandCenter receive Play/Pause/Stop taps from it.
 */
public class LiveRunNowPlayingModule: Module {
  private var engine: AVAudioEngine?
  private var playerNode: AVAudioPlayerNode?
  private var commandsConfigured = false
  /** Mirrors the last state passed via updateNowPlaying/setPaused — lets togglePlayPauseCommand (single-button remotes) emit the correct direction instead of guessing. */
  private var isPaused = false

  public func definition() -> ModuleDefinition {
    Name("LiveRunNowPlaying")

    Events("onRemotePlay", "onRemotePause", "onRemoteStop")

    AsyncFunction("activate") {
      self.setupIfNeeded()
    }
    .runOnQueue(.main)

    AsyncFunction("updateNowPlaying") { (title: String, artist: String, paused: Bool) in
      self.updateNowPlaying(title: title, artist: artist, paused: paused)
    }
    .runOnQueue(.main)

    AsyncFunction("setPaused") { (paused: Bool) in
      self.setPaused(paused)
    }
    .runOnQueue(.main)

    AsyncFunction("deactivate") {
      self.deactivateSession()
    }
    .runOnQueue(.main)
  }

  private func setupIfNeeded() {
    guard engine == nil else { return }

    do {
      let session = AVAudioSession.sharedInstance()
      // .mixWithOthers so a runner's own music/podcast keeps playing —
      // this session only needs to exist to hold the Now Playing slot and
      // keep the process alive in the background, not to produce sound.
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)
    } catch {
      // Not fatal — Now Playing info/remote commands still mostly work
      // without a successfully activated session, so keep going.
    }

    let newEngine = AVAudioEngine()
    let newPlayer = AVAudioPlayerNode()
    newEngine.attach(newPlayer)

    guard let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1) else {
      return
    }
    let frameCount = AVAudioFrameCount(format.sampleRate)

    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
      return
    }
    buffer.frameLength = frameCount
    // Explicitly zero the buffer rather than relying on fresh allocations
    // already being zeroed — guarantees true digital silence either way.
    if let channelData = buffer.floatChannelData {
      for channel in 0..<Int(format.channelCount) {
        memset(channelData[channel], 0, Int(frameCount) * MemoryLayout<Float>.size)
      }
    }

    newEngine.connect(newPlayer, to: newEngine.mainMixerNode, format: format)
    newEngine.mainMixerNode.outputVolume = 0.0

    do {
      try newEngine.start()
    } catch {
      return
    }

    newPlayer.scheduleBuffer(buffer, at: nil, options: .loops, completionHandler: nil)
    newPlayer.play()

    engine = newEngine
    playerNode = newPlayer

    configureRemoteCommandsIfNeeded()
  }

  private func configureRemoteCommandsIfNeeded() {
    guard !commandsConfigured else { return }
    commandsConfigured = true

    let center = MPRemoteCommandCenter.shared()

    center.playCommand.isEnabled = true
    center.playCommand.addTarget { [weak self] _ in
      self?.sendEvent("onRemotePlay")
      return .success
    }

    center.pauseCommand.isEnabled = true
    center.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onRemotePause")
      return .success
    }

    // Only reached by generic single-button remotes (e.g. some wired
    // earbuds); the on-screen lock-screen button sends playCommand/
    // pauseCommand directly based on the state set below, never this.
    center.togglePlayPauseCommand.isEnabled = true
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      guard let self else { return .success }
      self.sendEvent(self.isPaused ? "onRemotePlay" : "onRemotePause")
      return .success
    }

    center.stopCommand.isEnabled = true
    center.stopCommand.addTarget { [weak self] _ in
      self?.sendEvent("onRemoteStop")
      return .success
    }

    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
  }

  private func updateNowPlaying(title: String, artist: String, paused: Bool) {
    isPaused = paused

    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
    info[MPMediaItemPropertyTitle] = title
    info[MPMediaItemPropertyArtist] = artist
    info[MPNowPlayingInfoPropertyIsLiveStream] = true
    info[MPNowPlayingInfoPropertyPlaybackRate] = paused ? 0.0 : 1.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    MPNowPlayingInfoCenter.default().playbackState = paused ? .paused : .playing
  }

  private func setPaused(_ paused: Bool) {
    isPaused = paused

    if let player = playerNode {
      if paused {
        player.pause()
      } else if !player.isPlaying {
        player.play()
      }
    }

    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
    info[MPNowPlayingInfoPropertyPlaybackRate] = paused ? 0.0 : 1.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    MPNowPlayingInfoCenter.default().playbackState = paused ? .paused : .playing
  }

  private func deactivateSession() {
    playerNode?.stop()
    engine?.stop()
    playerNode = nil
    engine = nil
    isPaused = false

    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
