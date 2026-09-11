import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ToolbarButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Highlighted (e.g. panel open, hand raised). */
  active?: boolean;
  /** Red background for destructive or "off" states. */
  danger?: boolean;
  disabled?: boolean;
  badge?: number;
}

export function ToolbarButton({
  icon,
  label,
  onPress,
  active = false,
  danger = false,
  disabled = false,
  badge = 0,
}: ToolbarButtonProps) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.iconWrap, active && styles.iconActive, danger && styles.iconDanger]}>
        <Ionicons name={icon} size={22} color={colors.text} />
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    gap: 4,
    width: 72,
  },
  disabled: {
    opacity: 0.4,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  iconActive: {
    backgroundColor: colors.primary,
  },
  iconDanger: {
    backgroundColor: colors.danger,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
