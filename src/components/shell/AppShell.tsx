import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Account } from '../../auth/types';
import { colors } from '../../theme';
import { SECTIONS, type Section } from './sections';

export const SIDEBAR_MIN_WIDTH = 900;

export interface AppShellProps {
  section: Section;
  onSelect: (section: Section) => void;
  user: Account | null;
  onSignOut: () => void;
  children: ReactNode;
}

export function AppShell({ section, onSelect, user, onSignOut, children }: AppShellProps) {
  const { width } = useWindowDimensions();
  const sidebar = width >= SIDEBAR_MIN_WIDTH;

  const items = SECTIONS.map((item) => {
    const active = item.id === section;
    return (
      <Pressable
        key={item.id}
        style={[
          sidebar ? styles.navItem : styles.tabItem,
          active && sidebar && styles.navItemActive,
        ]}
        onPress={() => onSelect(item.id)}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
      >
        <Ionicons
          name={active ? item.icon : (`${item.icon}-outline` as typeof item.icon)}
          size={22}
          color={active ? colors.text : colors.textMuted}
        />
        <Text
          style={[styles.navLabel, active && styles.navLabelActive, !sidebar && styles.tabLabel]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  });

  const account = user && (
    <Pressable
      style={styles.account}
      onPress={onSignOut}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.displayName.charAt(0).toUpperCase()}</Text>
      </View>
      {sidebar && (
        <View style={styles.accountText}>
          <Text style={styles.accountName} numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text style={styles.accountHint}>Sign out</Text>
        </View>
      )}
    </Pressable>
  );

  if (!sidebar) {
    return (
      <View style={styles.column}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>Collab</Text>
          {account}
        </View>
        <View style={styles.content}>{children}</View>
        <View style={styles.tabBar}>{items}</View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.sidebar}>
        <Text style={styles.brand}>Collab</Text>
        <View style={styles.nav}>{items}</View>
        {account}
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  column: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  sidebar: {
    width: 232,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 24,
    gap: 24,
  },
  brand: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    paddingHorizontal: 12,
  },
  nav: {
    flex: 1,
    gap: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
  },
  navItemActive: {
    backgroundColor: colors.surfaceRaised,
  },
  navLabel: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  navLabelActive: {
    color: colors.text,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 8,
  },
  tabItem: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 16,
  },
  tabLabel: {
    fontSize: 11,
  },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text,
    fontWeight: '700',
  },
  accountText: {
    flex: 1,
  },
  accountName: {
    color: colors.text,
    fontWeight: '600',
  },
  accountHint: {
    color: colors.textSubtle,
    fontSize: 12,
  },
});
