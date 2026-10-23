import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ListedDevice } from '../../webrtc/devices';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

export interface DevicePanelProps {
  devices: readonly ListedDevice[];
  selected: { audioinput: string; videoinput: string; audiooutput: string };
  onChoose: (kind: ListedDevice['kind'], deviceId: string) => void;
  onClose: () => void;
}

const GROUPS: ReadonlyArray<{ kind: ListedDevice['kind']; title: string }> = [
  { kind: 'videoinput', title: 'Camera' },
  { kind: 'audioinput', title: 'Microphone' },
  { kind: 'audiooutput', title: 'Speaker' },
];

export function DevicePanel({ devices, selected, onChoose, onClose }: DevicePanelProps) {
  return (
    <SidePanel title="Devices" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.body}>
        {GROUPS.map((group) => {
          const rows = devices.filter((device) => device.kind === group.kind);
          return (
            <View key={group.kind} style={styles.group}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              {rows.length === 0 && <Text style={styles.empty}>None found</Text>}
              {rows.map((device) => {
                const active = selected[device.kind] === device.deviceId;
                return (
                  <Pressable
                    key={`${device.kind}:${device.deviceId}`}
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => onChoose(device.kind, device.deviceId)}
                    accessibilityRole="button"
                    accessibilityLabel={device.label}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={styles.label}>{device.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
    gap: 16,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 14,
  },
  row: {
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowActive: {
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
