import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCollabSession } from './src/hooks/useCollabSession';
import { useAuth } from './src/auth/useAuth';
import { createSignaling } from './src/signaling';
import { readRoomFromLink, syncRoomInLink } from './src/meeting/invite';
import { Lobby } from './src/components/Lobby';
import { LoginScreen } from './src/components/LoginScreen';
import { MeetingScreen } from './src/components/meeting/MeetingScreen';
import { colors } from './src/theme';

export default function App() {
  const auth = useAuth();
  const session = useCollabSession(createSignaling);
  const [roomId, setRoomId] = useState(() => readRoomFromLink() ?? '');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const name = auth.user?.displayName;
    if (name) {
      setDisplayName((current) => current || name);
    }
  }, [auth.user]);

  const inMeeting = session.status === 'connected';

  useEffect(() => {
    syncRoomInLink(inMeeting ? roomId : null);
  }, [inMeeting, roomId]);

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

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      {inMeeting ? (
        <MeetingScreen session={session} roomId={roomId.trim()} displayName={displayName.trim()} />
      ) : (
        <Lobby
          displayName={displayName}
          onDisplayNameChange={setDisplayName}
          roomId={roomId}
          onRoomIdChange={setRoomId}
          onJoin={(video) =>
            void session.join({ roomId: roomId.trim(), displayName: displayName.trim(), video })
          }
          connecting={session.status === 'connecting'}
          error={session.error}
          user={auth.user}
          onSignOut={() => void auth.signOut()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
