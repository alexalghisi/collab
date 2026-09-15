import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCollabSession } from './src/hooks/useCollabSession';
import { useAuth } from './src/auth/useAuth';
import { useTeamChat } from './src/chat/useTeamChat';
import { createSignaling } from './src/signaling';
import { nextHalfHour } from './src/meeting/calendar';
import { readRoomFromLink, syncRoomInLink } from './src/meeting/invite';
import { readLiveMeeting } from './src/meeting/resume';
import type { Meeting, MeetingDraft } from './src/meeting/types';
import { useMeetings } from './src/meeting/useMeetings';
import { useGoogleCalendar } from './src/meeting/useGoogleCalendar';
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
  const googleCalendar = useGoogleCalendar(auth.user?.uid ?? 'guest', meetings);
  const meetingSearch = useMeetingSearch();
  const teamChat = useTeamChat(auth.user);
  const [view, setView] = useState<View>('home');
  const [scheduleStart, setScheduleStart] = useState(() => nextHalfHour());
  const [roomId, setRoomId] = useState(() => readRoomFromLink() ?? '');
  const [displayName, setDisplayName] = useState('');
  const resumeAttempted = useRef(false);

  useEffect(() => {
    const name = auth.user?.displayName;
    if (name) {
      setDisplayName(name);
    }
  }, [auth.user]);

  // Stays true while moving between a room and its breakout rooms.
  const inMeeting = session.roomId !== null;

  useEffect(() => {
    if (inMeeting || roomId.trim()) {
      syncRoomInLink(roomId.trim() || null);
    }
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
  const deleteMeeting = (meeting: Meeting) => {
    void googleCalendar.retract(meeting);
    void meetings.remove(meeting.id);
  };

  useEffect(() => {
    if (resumeAttempted.current || !auth.user || session.status !== 'idle') {
      return;
    }
    const live = readLiveMeeting();
    if (!live) {
      return;
    }
    const name = (live.displayName || displayName || auth.user.displayName || 'Guest').trim();
    resumeAttempted.current = true;
    setDisplayName(name);
    setRoomId(live.roomId);
    void session
      .join({
        roomId: live.roomId,
        displayName: name,
        video: live.video,
      })
      .then((joined) => {
        if (joined) {
          void meetings.recordInstant(live.roomId);
        }
      });
  }, [auth.user, displayName, session.status]);

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
    void meetings.schedule(draft).then((meeting) => googleCalendar.publish(meeting));
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
            ownerId={auth.user.uid}
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
            google={googleCalendar}
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
