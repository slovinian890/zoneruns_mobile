import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientButton } from '@/components/ui/gradient-button';
import { AuroraColors, Spacing, BorderRadius } from '@/constants/theme';
import { HexCell } from '@/services/supabase';
import { fortifyNextCost, isHexAlly, MAX_HEX_LEVEL } from '@/services/territoryService';

interface HexActionModalProps {
  visible: boolean;
  cell: HexCell | null;
  myUserId: string;
  /** The clan the viewer currently represents, if any — a hex owned by this clan is "mine" regardless of which teammate last touched it. */
  myGroupId: string | null;
  myCoins: number;
  busy?: boolean;
  onClose: () => void;
  onFortify: () => void;
  onStartBounty: () => void;
  onCancelBounty: () => void;
}

/** Pips showing defense level out of the level-10 fortify ceiling. */
function LevelPips({ level, maxLevel }: { level: number; maxLevel: number }) {
  return (
    <View style={styles.pipsRow}>
      {Array.from({ length: MAX_HEX_LEVEL }, (_, idx) => idx + 1).map((i) => (
        <View
          key={i}
          style={[
            styles.pip,
            i <= level && styles.pipFilled,
            i > level && i <= maxLevel && styles.pipCeiling,
          ]}
        />
      ))}
    </View>
  );
}

export default function HexActionModal({
  visible,
  cell,
  myUserId,
  myGroupId,
  myCoins,
  busy,
  onClose,
  onFortify,
  onStartBounty,
  onCancelBounty,
}: HexActionModalProps) {
  if (!cell) return null;

  const isMine = isHexAlly(cell.userId, cell.ownerGroupId, myUserId, myGroupId);
  const isNeutral = !cell.userId;
  const level = cell.level ?? 1;
  const maxLevel = cell.maxLevel ?? 2;
  const nextCost = isMine ? fortifyNextCost(maxLevel) : null;

  const title = isNeutral
    ? 'Unoccupied hex'
    : cell.ownerGroupId
      ? (isMine ? `Your clan: ${cell.groupName ?? '?'}` : `Clan ${cell.groupName ?? '?'}`)
      : (isMine ? 'Your hex' : `Hex @${cell.username ?? '?'}`);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <IconSymbol name="hexagon.fill" size={18} color={AuroraColors.primary} />
              <ThemedText type="h3">{title}</ThemedText>
            </View>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={20} color={AuroraColors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {isNeutral ? (
              <ThemedText type="body" variant="secondary">
                This hex is unoccupied. Run across it during a run to capture it.
              </ThemedText>
            ) : (
              <>
                {!!cell.ownerGroupId && (
                  <ThemedText type="caption" variant="muted">
                    Last captured by: @{cell.username ?? '?'} — any clan member can fortify this hex.
                  </ThemedText>
                )}

                <View style={styles.levelRow}>
                  <ThemedText type="bodyBold">Defense level {level}/{MAX_HEX_LEVEL}</ThemedText>
                  <LevelPips level={level} maxLevel={maxLevel} />
                </View>

                {cell.bountyTotal > 0 && (
                  <View style={styles.bountyNotice}>
                    <IconSymbol name="bounty.fill" size={16} color={AuroraColors.danger} />
                    <ThemedText type="bodySmall" lightColor={AuroraColors.danger} darkColor={AuroraColors.danger} style={{ flex: 1 }}>
                      {isMine
                        ? `Someone is offering ${cell.bountyTotal} coins to clear this hex`
                        : `Total bounty on this hex: ${cell.bountyTotal} coins`}
                    </ThemedText>
                  </View>
                )}

                {!isMine && cell.myBounty > 0 && (
                  <View style={styles.myBountyRow}>
                    <ThemedText type="bodySmall" variant="muted">Your bounty share: {cell.myBounty} coins</ThemedText>
                    <TouchableOpacity onPress={onCancelBounty} disabled={busy}>
                      <ThemedText type="bodySmall" lightColor={AuroraColors.primary} darkColor={AuroraColors.primary}>
                        Cancel
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.coinsRow}>
                  <IconSymbol name="coins.fill" size={14} color={AuroraColors.accentAmber} />
                  <ThemedText type="caption" variant="muted">{myCoins} coins available</ThemedText>
                </View>

                {isMine ? (
                  nextCost != null ? (
                    <GradientButton
                      label={`Fortify to level ${maxLevel + 1} — ${nextCost} coins`}
                      icon="lock.shield.fill"
                      onPress={onFortify}
                      disabled={busy || myCoins < nextCost}
                      variant="primary"
                    />
                  ) : (
                    <View style={styles.maxedBadge}>
                      <ThemedText type="bodySmall" variant="muted">Hex is fully fortified ({MAX_HEX_LEVEL}/{MAX_HEX_LEVEL})</ThemedText>
                    </View>
                  )
                ) : (
                  <GradientButton
                    label="Set bounty"
                    icon="bounty.fill"
                    onPress={onStartBounty}
                    disabled={busy}
                    variant="primary"
                  />
                )}
              </>
            )}
          </View>

          <TouchableOpacity style={styles.skipButton} onPress={onClose}>
            <ThemedText type="body" variant="muted">Close</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AuroraColors.border,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  levelRow: {
    gap: Spacing.xs,
  },
  pipsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  pip: {
    width: 13,
    height: 13,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: AuroraColors.border,
    backgroundColor: 'transparent',
  },
  pipFilled: {
    backgroundColor: AuroraColors.primary,
    borderColor: AuroraColors.primary,
  },
  pipCeiling: {
    borderColor: AuroraColors.textMuted,
  },
  bountyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: AuroraColors.surfaceSolid,
    borderRadius: BorderRadius.card,
    padding: Spacing.sm,
  },
  myBountyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  maxedBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
});
