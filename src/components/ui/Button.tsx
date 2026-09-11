import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { IconName } from './icons';
import { colors } from '../../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: ButtonVariant;
  disabled?: boolean;
  compact?: boolean;
}

const backgrounds: Record<ButtonVariant, string> = {
  primary: colors.primary,
  secondary: colors.surfaceRaised,
  danger: colors.danger,
};

export function Button({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  compact = false,
}: ButtonProps) {
  return (
    <Pressable
      style={[
        styles.button,
        compact && styles.compact,
        { backgroundColor: backgrounds[variant] },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {icon && <Ionicons name={icon} size={compact ? 16 : 18} color={colors.text} />}
      <Text style={[styles.label, compact && styles.compactLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  compact: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  compactLabel: {
    fontSize: 14,
  },
});
