import { useEffect, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCollabSession } from './src/hooks/useCollabSession';
import { useAuth } from './src/auth/useAuth';
import { VideoTile } from './src/components/VideoTile';
import { LoginScreen } from './src/components/LoginScreen';

const SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL ?? 'http://localhost:4000';

export default function App() {
  const auth = useAuth();
  const session = useCollabSession(SIGNALING_URL);
  const [roomId, setRoomId] = useState('demo-room');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const name = auth.user?.displayName;
    if (name) {
      setDisplayName((current) => current || name);
    }
  }, [auth.user]);

  const inCall = session.status === 'connecting' || session.status === 'connected';

  if (auth.enabled && auth.initializing) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (auth.enabled && !auth.user) {
    return <LoginScreen onSignIn={auth.signIn} error={auth.error} />;
  }

  const handleJoin = (): void => {
    const room = roomId.trim();
    const name = displayName.trim();
    if (room && name) {
      void session.join(room, name);
    }
  };

  if (!inCall) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.lobby}>
          <Text style={styles.brand}>Collab</Text>
          <Text style={styles.subtitle}>Secure cross-platform video meetings</Text>

          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor="#6b7280"
            autoCapitalize="words"
          />
          <TextInput
            style={styles.input}
            value={roomId}
            onChangeText={setRoomId}
            placeholder="Room ID"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
          />

          <Pressable
            style={[styles.primaryButton, !displayName.trim() && styles.primaryButtonDisabled]}
            onPress={handleJoin}
            disabled={!displayName.trim()}
          >
            <Text style={styles.primaryButtonText}>Join meeting</Text>
          </Pressable>

          {session.status === 'error' && (
            <Text style={styles.error}>Unable to reach the signaling server.</Text>
          )}

          {auth.enabled && auth.user && (
            <Pressable style={styles.signOut} onPress={auth.signOut}>
              <Text style={styles.signOutText}>Sign out ({auth.user.displayName})</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.roomTitle}>{roomId}</Text>
          <Text style={styles.roomMeta}>{session.participants.length + 1} participant(s)</Text>
        </View>
        <Pressable style={styles.leaveButton} onPress={session.leave}>
          <Text style={styles.leaveButtonText}>Leave</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        <View style={styles.cell}>
          <VideoTile
            label={`${displayName} (You)`}
            stream={session.localStream ?? undefined}
            mirror
          />
        </View>
        {session.participants.map((participant) => (
          <View key={participant.peerId} style={styles.cell}>
            <VideoTile label={participant.displayName} stream={participant.stream} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0b1120',
  },
  lobby: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  brand: {
    color: '#f9fafb',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#111827',
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 12,
    color: '#f9fafb',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#1e3a8a',
  },
  primaryButtonText: {
    color: '#ffffff',
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
    color: '#9ca3af',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  roomTitle: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '700',
  },
  roomMeta: {
    color: '#9ca3af',
    fontSize: 13,
  },
  leaveButton: {
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  leaveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  cell: {
    width: '50%',
    padding: 6,
  },
});
