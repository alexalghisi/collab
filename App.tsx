import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCollabSession } from './src/hooks/useCollabSession';
import { useAuth } from './src/auth/useAuth';
import { useTeamChat } from './src/chat/useTeamChat';
import { createSignaling } from './src/signaling';
import { nextHalfHour } from './src/meeting/calendar';
import { readRoomFromLink, syncRoomInLink } from './src/meeting/invite';
import type { Meeting, MeetingDraft } from './src/meeting/types';
import { useMeetings } from './src/meeting/useMeetings';
import { useMeetingSearch } from './src/search/useMeetingSearch';
import { CalendarScreen } from './src/components/calendar/CalendarScreen';
import { TeamChatScreen } from './src/components/chat/TeamChatScreen';
import { HomeScreen } from './src/components/home/HomeScreen';
import { AuthScreen } from './src/components/auth/AuthScreen';
import { MeetingScreen } from './src/components/meeting/MeetingScreen';
import { WaitingScreen } from './src/components/meeting/WaitingScreen';
import { MeetingsScreen } from './src/components/meetings/MeetingsScreen';
import { ScheduleMeetingScreen } from './src/components/meetings/ScheduleMeetingScreen';
import { SearchScreen } from './src/components/search/SearchScreen';
import { AppShell } from './src/components/shell/AppShell';
import type { Section } from './src/components/shell/sections';
import { colors } from './src/theme';

type View = Section | 'schedule';

export default function App() {
  const auth = useAuth();
  const session = useCollabSession(createSignaling);
  const meetings = useMeetings(auth.user?.uid ?? 'guest');
  const meetingSearch = useMeetingSearch();
  const teamChat = useTeamChat(auth.user);
  const [view, setView] = useState<View>('home');
  const [scheduleStart, setScheduleStart] = useState(() => nextHalfHour());
  const [roomId, setRoomId] = useState(() => readRoomFromLink() ?? '');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const name = auth.user?.displayName;
    if (name) {
      setDisplayName(name);
    }
  }, [auth.user]);

  // Stays true while moving between a room and its breakout rooms.
  const inMeeting = session.roomId !== null;

  useEffect(() => {
    syncRoomInLink(inMeeting ? roomId : null);
  }, [inMeeting, roomId]);

  const joinRoom = async (nextRoomId: string, video: boolean) => {
    setRoomId(nextRoomId);
    setView('home');
    const joined = await session.join({
      roomId: nextRoomId,
      displayName: displayName.trim(),
      video,
    });
    if (joined) {
      await meetings.recordInstant(nextRoomId);
    }
  };

  const startMeeting = (meeting: Meeting) => void joinRoom(meeting.roomId, true);
  const deleteMeeting = (meeting: Meeting) => void meetings.remove(meeting.id);

  /** Opens the form at the next half hour, on `day` when one was picked in the calendar. */
  const openSchedule = (day?: Date) => {
    const start = nextHalfHour();
    if (day) {
      start.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    }
    setScheduleStart(start);
    setView('schedule');
  };

  const saveMeeting = (draft: MeetingDraft) => {
    void meetings.schedule(draft);
    setView('meetings');
  };

  if (auth.initializing) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (!auth.user) {
    return (
      <AuthScreen
        onSignIn={(provider) => void auth.signIn(provider)}
        onSignInWithEmail={auth.signInWithEmail}
        onCreateAccount={auth.createAccount}
        social={auth.social}
        error={auth.error}
      />
    );
  }

  if (session.status === 'waiting') {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <WaitingScreen roomId={roomId.trim()} onLeave={session.leave} />
      </SafeAreaView>
    );
  }

  if (inMeeting) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="light" />
        <MeetingScreen session={session} roomId={roomId.trim()} displayName={displayName.trim()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <AppShell
        section={view === 'schedule' ? 'meetings' : view}
        onSelect={setView}
        user={auth.user}
        onSignOut={() => void auth.signOut()}
      >
        {view === 'home' && (
          <HomeScreen
            displayName={displayName}
            roomId={roomId}
            onRoomIdChange={setRoomId}
            onJoin={(nextRoomId, video) => void joinRoom(nextRoomId, video)}
            onSchedule={() => openSchedule()}
            connecting={session.status === 'connecting'}
            error={session.error}
            meetings={meetings.meetings}
            onStartMeeting={startMeeting}
            onDeleteMeeting={deleteMeeting}
          />
        )}
        {view === 'meetings' && (
          <MeetingsScreen
            meetings={meetings.meetings}
            onStart={startMeeting}
            onDelete={deleteMeeting}
            onSchedule={() => openSchedule()}
          />
        )}
        {view === 'calendar' && (
          <CalendarScreen
            meetings={meetings.meetings}
            onStart={startMeeting}
            onDelete={deleteMeeting}
            onSchedule={openSchedule}
          />
        )}
        {view === 'chat' && <TeamChatScreen chat={teamChat} selfId={auth.user?.uid ?? null} />}
        {view === 'search' && <SearchScreen search={meetingSearch} />}
        {view === 'schedule' && (
          <ScheduleMeetingScreen
            initialStart={scheduleStart}
            onSave={saveMeeting}
            onCancel={() => setView('meetings')}
          />
        )}
      </AppShell>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
