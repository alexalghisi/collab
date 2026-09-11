import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AuthUser } from '../auth/types';
import { generateRoomId } from '../meeting/roomId';
import { colors } from '../theme';

export interface LobbyProps {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  roomId: string;
  onRoomIdChange: (value: string) => void;
  onJoin: (video: boolean) => void;
  connecting: boolean;
  error: string | null;
  user: AuthUser | null;
  onSignOut: () => void;
}

export function Lobby({
  displayName,
  onDisplayNameChange,
  roomId,
  onRoomIdChange,
  onJoin,
  connecting,
  error,
  user,
  onSignOut,
}: LobbyProps) {
  const ready = displayName.trim().length > 0 && roomId.trim().length > 0 && !connecting;

  return (
    <View style={styles.lobby}>
      <Text style={styles.brand}>Collab</Text>
      <Text style={styles.subtitle}>Secure cross-platform video meetings</Text>

      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="Your name"
        placeholderTextColor={colors.textSubtle}
        autoCapitalize="words"
      />
      <View style={styles.roomRow}>
        <TextInput
          style={[styles.input, styles.roomInput]}
          value={roomId}
          onChangeText={onRoomIdChange}
          placeholder="Meeting ID or paste an invite link id"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={styles.generate}
          onPress={() => onRoomIdChange(generateRoomId())}
          accessibilityRole="button"
          accessibilityLabel="Generate a new meeting ID"
        >
          <Ionicons name="shuffle" size={18} color={colors.text} />
          <Text style={styles.generateText}>New ID</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.primaryButton, !ready && styles.primaryButtonDisabled]}
        onPress={() => onJoin(true)}
        disabled={!ready}
        accessibilityRole="button"
      >
        <Ionicons name="videocam" size={18} color={colors.text} />
        <Text style={styles.buttonText}>{connecting ? 'Connecting…' : 'Join with video'}</Text>
      </Pressable>
      <Pressable
        style={[styles.secondaryButton, !ready && styles.secondaryButtonDisabled]}
        onPress={() => onJoin(false)}
        disabled={!ready}
        accessibilityRole="button"
      >
        <Ionicons name="call" size={18} color={colors.text} />
        <Text style={styles.buttonText}>Join audio only</Text>
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}

      {user && (
        <Pressable style={styles.signOut} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign out ({user.displayName})</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  lobby: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  brand: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  roomRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roomInput: {
    flex: 1,
  },
  generate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  generateText: {
    color: colors.text,
    fontWeight: '600',
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: colors.primaryDisabled,
  },
  secondaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingVertical: 16,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
  },
  signOut: {
    marginTop: 12,
    alignItems: 'center',
  },
  signOutText: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
