import { useMemo, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientButton } from '@/components/ui/gradient-button';
import { Input } from '@/components/ui/input';
import { AuroraColors, Spacing } from '@/constants/theme';
import { HexCellId } from '@/services/territoryService';

interface BountyAmountModalProps {
  visible: boolean;
  hexes: HexCellId[];
  myCoins: number;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (totalAmount: number) => void;
}

export default function BountyAmountModal({ visible, hexes, myCoins, busy, onClose, onConfirm }: BountyAmountModalProps) {
  const [amountText, setAmountText] = useState('');
  const count = hexes.length;

  const amount = useMemo(() => {
    const n = parseInt(amountText, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountText]);

  const perHex = count > 0 ? Math.floor(amount / count) : 0;
  const charged = perHex * count;
  const valid = count > 0 && perHex >= 1 && charged <= myCoins;

  const handleClose = () => {
    setAmountText('');
    onClose();
  };

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(amount);
    setAmountText('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <ThemedView style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <IconSymbol name="bounty.fill" size={18} color={AuroraColors.primary} />
              <ThemedText type="h3">Set bounty</ThemedText>
            </View>
            <TouchableOpacity onPress={handleClose}>
              <IconSymbol name="xmark" size={20} color={AuroraColors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <ThemedText type="body" variant="secondary">
              Selected hexes: {count}. The amount splits evenly between them — whoever lands the finishing hit on a
              hex (clearing it to unclaimed) gets their share in coins.
            </ThemedText>

            <Input
              icon="coins.fill"
              keyboardType="number-pad"
              value={amountText}
              onChangeText={setAmountText}
              placeholder="Total coin amount"
              rightElement={
                <ThemedText type="caption" variant="muted" style={styles.suffix}>
                  coins
                </ThemedText>
              }
            />

            <View style={styles.previewRow}>
              <IconSymbol name="coins.fill" size={14} color={AuroraColors.accentAmber} />
              <ThemedText type="bodySmall" variant="muted">
                {count > 0 ? `= ${perHex} coins per hex (${charged} total)` : 'Select at least one hex'}
              </ThemedText>
            </View>

            {amount > 0 && perHex < 1 && (
              <ThemedText type="caption" lightColor={AuroraColors.danger} darkColor={AuroraColors.danger}>
                The amount is too low for {count} {count === 1 ? 'hex' : 'hexes'} — each needs at least 1 coin.
              </ThemedText>
            )}
            {charged > myCoins && perHex >= 1 && (
              <ThemedText type="caption" lightColor={AuroraColors.danger} darkColor={AuroraColors.danger}>
                Not enough coins — you have {myCoins}.
              </ThemedText>
            )}

            <GradientButton
              label={charged > 0 ? `Place bounty (${charged} coins)` : 'Place bounty'}
              icon="bounty.fill"
              onPress={handleConfirm}
              disabled={!valid || busy}
              variant="primary"
            />
          </View>

          <TouchableOpacity style={styles.skipButton} onPress={handleClose}>
            <ThemedText type="body" variant="muted">Cancel</ThemedText>
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
  suffix: {
    marginRight: Spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  skipButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
});
