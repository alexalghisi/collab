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
import { INVITE_ACTION_LABEL } from '../../meeting/invite';
import { CAN_RECORD } from '../../meeting/recording';
import { useRecording } from '../../meeting/useRecording';
import { colors } from '../../theme';
import { Button } from '../ui/Button';
import { VideoTile } from '../VideoTile';
import { ChatPanel } from './ChatPanel';
import { InvitePanel } from './InvitePanel';
import { CodePanel } from './CodePanel';
import { AssistantPanel } from './AssistantPanel';
import { NotesPanel } from './NotesPanel';
import { TranscriptPanel } from './TranscriptPanel';
import { ParticipantsPanel, type ParticipantRow } from './ParticipantsPanel';
import { ReactionPicker } from './ReactionPicker';
import { ToolbarButton } from './ToolbarButton';
import { Whiteboard } from './Whiteboard';

export interface MeetingScreenProps {
  session: CollabSession;
  /** Main room id; invites always point here, even from a breakout room. */
  roomId: string;
  displayName: string;
}

type Panel = 'participants' | 'chat' | 'notes' | 'transcript' | 'assistant' | 'invite' | null;
/** What fills the meeting body: the tiles, or a shared surface above a tile strip. */
type Stage = 'grid' | 'whiteboard' | 'code';

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
  const [stage, setStage] = useState<Stage>('grid');
  const [readCount, setReadCount] = useState(0);
  const recording = useRecording(session.localStream, session.participants, roomId);

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

  const toggleStage = (next: Exclude<Stage, 'grid'>): void => {
    setStage((current) => (current === next ? 'grid' : next));
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
          <Text style={styles.roomTitle}>{session.roomId ?? roomId}</Text>
          <Text style={styles.roomMeta}>
            {tileCount} participant{tileCount === 1 ? '' : 's'}
            {session.breakoutOf ? ` · breakout room of ${session.breakoutOf}` : ''}
          </Text>
        </View>
        {recording.active && (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}
        {session.breakoutOf && (
          <Button
            label="Return to main room"
            icon="arrow-undo"
            variant="secondary"
            compact
            onPress={session.returnToMain}
          />
        )}
        <Pressable
          style={[styles.inviteButton, panel === 'invite' && styles.inviteButtonActive]}
          onPress={() => togglePanel('invite')}
          accessibilityRole="button"
          accessibilityLabel="Invite someone"
        >
          <Ionicons name="person-add-outline" size={16} color={colors.text} />
          <Text style={styles.inviteText}>{INVITE_ACTION_LABEL}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {stage !== 'grid' ? (
          <View style={styles.stage}>
            <ScrollView horizontal style={styles.stripScroll} contentContainerStyle={styles.strip}>
              {tiles.map(([key, tile]) => (
                <View key={key} style={[styles.cell, { width: STRIP_TILE_WIDTH }]}>
                  {tile}
                </View>
              ))}
            </ScrollView>
            {stage === 'whiteboard' ? (
              <Whiteboard
                strokes={session.strokes}
                selfPeerId={session.selfPeerId}
                onAddStroke={session.addStroke}
                onRemoveStrokes={session.removeStrokes}
              />
            ) : (
              session.code && (
                <CodePanel
                  document={session.code}
                  runs={session.runs}
                  selfPeerId={session.selfPeerId}
                  onRun={session.runCode}
                />
              )
            )}
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
              <ParticipantsPanel
                rows={rows}
                host={session.isHost ? session : null}
                onClose={() => setPanel(null)}
              />
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
            {panel === 'transcript' && (
              <TranscriptPanel
                segments={session.transcript}
                captionsOn={session.captionsOn}
                error={session.captionError}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'assistant' && (
              <AssistantPanel
                turns={session.assistantTurns}
                onAsk={session.askAssistant}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'invite' && (
              <InvitePanel
                roomId={roomId}
                onSend={session.sendInvite}
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
        {CAN_RECORD && (
          <ToolbarButton
            icon={recording.active ? 'stop-circle' : 'radio-button-on'}
            label={recording.active ? 'Stop recording' : 'Record'}
            danger={recording.active}
            onPress={() => (recording.active ? void recording.stop() : recording.start())}
          />
        )}
        <ToolbarButton
          icon="brush"
          label="Whiteboard"
          active={stage === 'whiteboard'}
          onPress={() => toggleStage('whiteboard')}
        />
        <ToolbarButton
          icon="code-slash"
          label="Code"
          active={stage === 'code'}
          onPress={() => toggleStage('code')}
        />
        <ToolbarButton
          icon="document-text-outline"
          label="Notes"
          active={panel === 'notes'}
          onPress={() => togglePanel('notes')}
        />
        <ToolbarButton
          icon={session.captionsOn ? 'mic-circle' : 'mic-circle-outline'}
          label={session.captionsOn ? 'Captions on' : 'Captions'}
          active={session.captionsOn}
          onPress={session.toggleCaptions}
        />
        <ToolbarButton
          icon="text-outline"
          label="Transcript"
          active={panel === 'transcript'}
          onPress={() => togglePanel('transcript')}
        />
        <ToolbarButton
          icon="sparkles-outline"
          label="Assistant"
          active={panel === 'assistant'}
          onPress={() => togglePanel('assistant')}
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
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerText: {
    flex: 1,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
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
  inviteButtonActive: {
    backgroundColor: colors.primary,
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
