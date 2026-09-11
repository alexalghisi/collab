import { useEffect, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CollabSession } from '../../hooks/useCollabSession';
import { INVITE_ACTION_LABEL, shareInvite } from '../../meeting/invite';
import { colors } from '../../theme';
import { VideoTile } from '../VideoTile';
import { ChatPanel } from './ChatPanel';
import { NotesPanel } from './NotesPanel';
import { ParticipantsPanel, type ParticipantRow } from './ParticipantsPanel';
import { ReactionPicker } from './ReactionPicker';
import { ToolbarButton } from './ToolbarButton';
import { Whiteboard } from './Whiteboard';

export interface MeetingScreenProps {
  session: CollabSession;
  roomId: string;
  displayName: string;
}

type Panel = 'participants' | 'chat' | 'notes' | null;

const WIDE_LAYOUT_MIN_WIDTH = 900;
const PANEL_WIDTH = 340;
/** Tile width in the strip shown above the whiteboard. */
const STRIP_TILE_WIDTH = 180;
const CAN_SHARE_SCREEN = Platform.OS === 'web';

function columnsFor(tileCount: number, width: number): number {
  if (tileCount === 1) {
    return 1;
  }
  const max = width >= 1400 ? 4 : width >= WIDE_LAYOUT_MIN_WIDTH ? 3 : 2;
  return Math.min(tileCount, max);
}

export function MeetingScreen({ session, roomId, displayName }: MeetingScreenProps) {
  const { width } = useWindowDimensions();
  const [panel, setPanel] = useState<Panel>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [inviteDone, setInviteDone] = useState(false);

  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const gridWidth = wide && panel ? width - PANEL_WIDTH : width;
  const tileCount = session.participants.length + 1;
  const cellWidth = `${100 / columnsFor(tileCount, gridWidth)}%` as const;
  const unread = session.messages.length - readCount;

  useEffect(() => {
    if (panel === 'chat') {
      setReadCount(session.messages.length);
    }
  }, [panel, session.messages.length]);

  const togglePanel = (next: Exclude<Panel, null>): void => {
    setPanel((current) => (current === next ? null : next));
  };

  const invite = async (): Promise<void> => {
    await shareInvite(roomId);
    setInviteDone(true);
    setTimeout(() => setInviteDone(false), 2000);
  };

  const rows: ParticipantRow[] = [
    {
      peerId: session.selfPeerId ?? 'self',
      displayName,
      state: session.self,
      isSelf: true,
      isHost: session.hostPeerId === session.selfPeerId,
    },
    ...session.participants.map((participant) => ({
      peerId: participant.peerId,
      displayName: participant.displayName,
      state: participant.state,
      isSelf: false,
      isHost: participant.peerId === session.hostPeerId,
    })),
  ];

  const tiles: Array<[string, ReactNode]> = [
    [
      'self',
      <VideoTile
        label={`${displayName} (You)`}
        state={session.self}
        stream={session.localStream ?? undefined}
        isHost={session.hostPeerId === session.selfPeerId}
        mirror
      />,
    ],
    ...session.participants.map((participant): [string, ReactNode] => [
      participant.peerId,
      <VideoTile
        label={participant.displayName}
        state={participant.state}
        stream={participant.stream}
        isHost={participant.peerId === session.hostPeerId}
      />,
    ]),
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.roomTitle}>{roomId}</Text>
          <Text style={styles.roomMeta}>
            {tileCount} participant{tileCount === 1 ? '' : 's'}
          </Text>
        </View>
        <Pressable style={styles.inviteButton} onPress={() => void invite()}>
          <Ionicons
            name={inviteDone ? 'checkmark' : 'link-outline'}
            size={16}
            color={colors.text}
          />
          <Text style={styles.inviteText}>{inviteDone ? 'Copied' : INVITE_ACTION_LABEL}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {whiteboardOpen ? (
          <View style={styles.stage}>
            <ScrollView horizontal style={styles.stripScroll} contentContainerStyle={styles.strip}>
              {tiles.map(([key, tile]) => (
                <View key={key} style={[styles.cell, { width: STRIP_TILE_WIDTH }]}>
                  {tile}
                </View>
              ))}
            </ScrollView>
            <Whiteboard
              strokes={session.strokes}
              selfPeerId={session.selfPeerId}
              onAddStroke={session.addStroke}
              onRemoveStrokes={session.removeStrokes}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid}>
            {tiles.map(([key, tile]) => (
              <View key={key} style={[styles.cell, { width: cellWidth }]}>
                {tile}
              </View>
            ))}
          </ScrollView>
        )}

        {panel && (
          <View style={wide ? styles.sidePanel : styles.overlayPanel}>
            {panel === 'participants' && (
              <ParticipantsPanel rows={rows} onClose={() => setPanel(null)} />
            )}
            {panel === 'chat' && (
              <ChatPanel
                messages={session.messages}
                selfPeerId={session.selfPeerId}
                onSend={session.sendMessage}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'notes' && (
              <NotesPanel
                notes={session.notes}
                onChange={session.updateNotes}
                onClose={() => setPanel(null)}
              />
            )}
          </View>
        )}
      </View>

      {reactionsOpen && (
        <ReactionPicker
          onPick={(emoji) => {
            session.sendReaction(emoji);
            setReactionsOpen(false);
          }}
        />
      )}

      <View style={styles.toolbar}>
        <ToolbarButton
          icon={session.self.audioMuted ? 'mic-off' : 'mic'}
          label={session.self.audioMuted ? 'Unmute' : 'Mute'}
          danger={session.self.audioMuted}
          onPress={session.toggleMic}
        />
        <ToolbarButton
          icon={session.self.videoOff ? 'videocam-off' : 'videocam'}
          label={session.self.videoOff ? 'Start video' : 'Stop video'}
          danger={session.self.videoOff}
          disabled={session.self.screenSharing}
          onPress={() => void session.toggleCamera()}
        />
        {CAN_SHARE_SCREEN && (
          <ToolbarButton
            icon="desktop-outline"
            label={session.self.screenSharing ? 'Stop share' : 'Share screen'}
            active={session.self.screenSharing}
            onPress={() => void session.toggleScreenShare()}
          />
        )}
        <ToolbarButton
          icon={session.self.handRaised ? 'hand-left' : 'hand-left-outline'}
          label={session.self.handRaised ? 'Lower hand' : 'Raise hand'}
          active={session.self.handRaised}
          onPress={session.toggleHand}
        />
        <ToolbarButton
          icon="happy-outline"
          label="React"
          active={reactionsOpen}
          onPress={() => setReactionsOpen((open) => !open)}
        />
        <ToolbarButton
          icon="brush"
          label="Whiteboard"
          active={whiteboardOpen}
          onPress={() => setWhiteboardOpen((open) => !open)}
        />
        <ToolbarButton
          icon="document-text-outline"
          label="Notes"
          active={panel === 'notes'}
          onPress={() => togglePanel('notes')}
        />
        <ToolbarButton
          icon="people"
          label="Participants"
          active={panel === 'participants'}
          onPress={() => togglePanel('participants')}
        />
        <ToolbarButton
          icon="chatbubble-ellipses"
          label="Chat"
          active={panel === 'chat'}
          badge={unread}
          onPress={() => togglePanel('chat')}
        />
        <ToolbarButton icon="exit-outline" label="Leave" danger onPress={session.leave} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerText: {
    flexShrink: 1,
  },
  roomTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  roomMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  inviteText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  stage: {
    flex: 1,
  },
  stripScroll: {
    flexGrow: 0,
  },
  strip: {
    paddingHorizontal: 6,
    paddingTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  cell: {
    padding: 6,
  },
  sidePanel: {
    width: PANEL_WIDTH,
  },
  overlayPanel: {
    ...StyleSheet.absoluteFillObject,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
