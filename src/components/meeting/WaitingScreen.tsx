import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

export interface WaitingScreenProps {
  roomId: string;
  onLeave: () => void;
}

/** Shown while the host decides whether to let us into a room with a waiting room. */
export function WaitingScreen({ roomId, onLeave }: WaitingScreenProps) {
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={styles.title}>Waiting for the host to let you in</Text>
      <Text style={styles.meta}>{roomId}</Text>
      <Button label="Leave" icon="exit-outline" variant="secondary" onPress={onLeave} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 8,
  },
});
