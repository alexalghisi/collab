import { useEffect, useRef, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCollabSession } from './src/hooks/useCollabSession';
import { useAuth } from './src/auth/useAuth';
import { useTeamChat } from './src/chat/useTeamChat';
import { createSignaling } from './src/signaling';
import { nextHalfHour } from './src/meeting/calendar';
import { readSessionToken } from './src/auth/session';
import { EXECUTION_URL } from './src/code/config';
import { InviteError, parseEmailList } from './src/meeting/contact';
import { buildInviteLink, readRoomFromLink, syncRoomInLink } from './src/meeting/invite';
import { sendContactInvite } from './src/meeting/sendInvite';
import { readLiveMeeting } from './src/meeting/resume';
import type { Meeting, MeetingDraft } from './src/meeting/types';
import { deleteMeeting as retractThenRemove } from './src/meeting/deleteMeeting';
import { useMeetings } from './src/meeting/useMeetings';
import { useGoogleCalendar } from './src/meeting/useGoogleCalendar';
import { useMeetingSearch } from './src/search/useMeetingSearch';
import { CalendarScreen } from './src/components/calendar/CalendarScreen';
import { TeamChatScreen } from './src/components/chat/TeamChatScreen';
import { HomeScreen } from './src/components/home/HomeScreen';
import { AuthScreen } from './src/components/auth/AuthScreen';
import { MeetingScreen } from './src/components/meeting/MeetingScreen';
import { WaitingScreen } from './src/components/meeting/WaitingScreen';
import type { MeetingInviteRequest } from './src/components/meetings/MeetingRow';
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
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
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

  const startMeeting = (meeting: Meeting) => void joinRoom(meeting.roomId, false);
  const inviteMeeting = async (meeting: Meeting, invite: MeetingInviteRequest): Promise<string> => {
    const typed = parseEmailList(invite.emails);
    const guests = typed.length > 0 ? typed : [...(meeting.guests ?? [])];
    if (guests.length === 0) {
      throw new InviteError('Enter an email address or a phone number.');
    }
    const token = readSessionToken();
    if (!token) {
      throw new InviteError('Sign in again to send email invites.');
    }
    await sendContactInvite(EXECUTION_URL, {
      contact: guests.join(','),
      roomId: meeting.roomId,
      sessionId: '',
      hostName: auth.user?.displayName ?? 'Someone',
      link: buildInviteLink(meeting.roomId),
      token,
      title: meeting.title,
      startsAt: meeting.startsAt,
      reminderMinutes: invite.reminderMinutes,
    });
    await meetings.save({
      ...meeting,
      guests,
      reminderMinutes: invite.reminderMinutes,
    });
    return `Email sent to ${guests.join(', ')}. They get a reminder ${invite.reminderMinutes} minutes before.`;
  };
  const deleteMeeting = (meeting: Meeting) => {
    void retractThenRemove(meeting, googleCalendar.retract, meetings.remove);
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
    setEditingMeeting(null);
    setScheduleStart(start);
    setView('schedule');
  };

  const openEdit = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setView('schedule');
  };

  const saveMeeting = (draft: MeetingDraft) => {
    if (editingMeeting) {
      const updated: Meeting = { ...editingMeeting, ...draft };
      void meetings.save(updated).then(() => googleCalendar.update(updated));
    } else {
      void meetings.schedule(draft).then((meeting) => googleCalendar.publish(meeting));
    }
    setEditingMeeting(null);
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
            onEditMeeting={openEdit}
            onDeleteMeeting={deleteMeeting}
            onInviteMeeting={inviteMeeting}
          />
        )}
        {view === 'meetings' && (
          <MeetingsScreen
            meetings={meetings.meetings}
            onStart={startMeeting}
            onEdit={openEdit}
            onDelete={deleteMeeting}
            onInvite={inviteMeeting}
            onSchedule={() => openSchedule()}
          />
        )}
        {view === 'calendar' && (
          <CalendarScreen
            meetings={meetings.meetings}
            onStart={startMeeting}
            onEdit={openEdit}
            onDelete={deleteMeeting}
            onInvite={inviteMeeting}
            onSchedule={openSchedule}
            google={googleCalendar}
          />
        )}
        {view === 'chat' && <TeamChatScreen chat={teamChat} selfId={auth.user?.uid ?? null} />}
        {view === 'search' && <SearchScreen search={meetingSearch} />}
        {view === 'schedule' && (
          <ScheduleMeetingScreen
            initialStart={scheduleStart}
            initialMeeting={editingMeeting}
            onSave={saveMeeting}
            onCancel={() => {
              setEditingMeeting(null);
              setView('meetings');
            }}
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
