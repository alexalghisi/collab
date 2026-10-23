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
import { sharedRoomFiles } from '../../files/roomFiles';
import type { CollabSession } from '../../hooks/useCollabSession';
import { INVITE_ACTION_LABEL } from '../../meeting/invite';
import { colors } from '../../theme';
import { cameraOn, microphoneOn } from '../../webrtc/captureState';
import { Button } from '../ui/Button';
import { VideoTile } from '../VideoTile';
import { ChatPanel } from './ChatPanel';
import { DevicePanel } from './DevicePanel';
import { FilesPanel } from './FilesPanel';
import { ProblemsPanel } from './ProblemsPanel';
import { InvitePanel } from './InvitePanel';
import { codeFillsScreen, isCompactCall } from './callLayout';
import { CodePanel } from './CodePanel';
import { DraggablePip } from './DraggablePip';
import { ParticipantsPanel, type ParticipantRow } from './ParticipantsPanel';
import { ReactionPicker } from './ReactionPicker';
import { ToolbarButton } from './ToolbarButton';
import { Whiteboard } from './Whiteboard';

export interface MeetingScreenProps {
  session: CollabSession;
  /** Main room id; invites always point here, even from a breakout room. */
  roomId: string;
  displayName: string;
  onInvite?: CollabSession['sendInvite'];
}

type Panel = 'participants' | 'chat' | 'invite' | 'files' | 'devices' | 'problems' | null;
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

export function MeetingScreen({ session, roomId, displayName, onInvite }: MeetingScreenProps) {
  const { width } = useWindowDimensions();
  // On a phone a panel covers the whole call, so start with the people in view.
  const [panel, setPanel] = useState<Panel>(() =>
    width < WIDE_LAYOUT_MIN_WIDTH ? null : session.messages.length > 0 ? 'chat' : 'invite',
  );
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);

  const stage: Stage = session.settings.stage;
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const compact = isCompactCall(width);
  const fullCode = codeFillsScreen(width, stage);
  const showExtraTools = !compact || moreOpen;
  const gridWidth = wide && panel ? width - PANEL_WIDTH : width;
  const tileCount = session.participants.length + 1;
  const cellWidth = `${100 / columnsFor(tileCount, gridWidth)}%` as const;
  const unread = session.messages.length - readCount;

  useEffect(() => {
    if (session.messages.length > 0) {
      setPanel((current) => (current === 'invite' ? 'chat' : current));
    }
  }, [session.messages.length]);

  useEffect(() => {
    if (panel === 'chat') {
      setReadCount(session.messages.length);
    }
  }, [panel, session.messages.length]);

  const togglePanel = (next: Exclude<Panel, null>): void => {
    setPanel((current) => (current === next ? null : next));
  };

  const toggleStage = (next: Exclude<Stage, 'grid'>): void => {
    session.updateSettings({ stage: stage === next ? 'grid' : next });
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
  const namesByPeerId: Record<string, string> = {};
  for (const row of rows) {
    namesByPeerId[row.peerId] = row.displayName;
  }
  const files = sharedRoomFiles(session.messages, session.boardFiles, namesByPeerId);

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
        quality={session.linkQuality[participant.peerId]}
      />,
    ]),
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.roomTitle} numberOfLines={1}>
            {session.roomId ?? roomId}
          </Text>
          <Text style={styles.roomMeta}>
            {tileCount === 1
              ? 'Only you so far — send the invite on the right'
              : `${tileCount} participants`}
            {session.breakoutOf ? ` · breakout room of ${session.breakoutOf}` : ''}
          </Text>
        </View>
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
            {!fullCode && (
              <ScrollView
                horizontal
                style={styles.stripScroll}
                contentContainerStyle={styles.strip}
              >
                {tiles.map(([key, tile]) => (
                  <View key={key} style={[styles.cell, { width: STRIP_TILE_WIDTH }]}>
                    {tile}
                  </View>
                ))}
              </ScrollView>
            )}
            {fullCode && (
              <DraggablePip>
                {(tiles.find(([key]) => key !== 'self') ?? tiles[0])?.[1]}
              </DraggablePip>
            )}
            {stage === 'whiteboard' ? (
              <Whiteboard
                strokes={session.strokes}
                boardFiles={session.boardFiles}
                selfPeerId={session.selfPeerId}
                onAddStroke={session.addStroke}
                onRemoveStrokes={session.removeStrokes}
                onAddBoardFile={session.addBoardFile}
                onRemoveBoardFiles={session.removeBoardFiles}
                onUploadFile={session.shareFile}
              />
            ) : (
              session.code && (
                <CodePanel
                  document={session.code}
                  runs={session.runs}
                  files={session.workspaceFiles}
                  selfPeerId={session.selfPeerId}
                  onRun={session.runCode}
                  onFilesChange={session.updateWorkspaceFiles}
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

        {panel === 'problems' && (
          <View style={wide ? styles.sidePanel : styles.sheet}>
            <ProblemsPanel
              onOpen={(problem) => {
                session.openProblem(problem);
                setPanel(null);
              }}
              onClose={() => setPanel(null)}
            />
          </View>
        )}

        {panel && panel !== 'problems' && (
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
                selfSessionId={session.sessionId}
                onSend={session.sendMessage}
                onEdit={session.editMessage}
                onDelete={session.deleteMessage}
                onUpload={session.shareFile}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'invite' && (
              <InvitePanel
                roomId={roomId}
                hostName={displayName}
                onSend={onInvite ?? session.sendInvite}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'files' && (
              <FilesPanel
                files={files}
                onUpload={session.shareFile}
                onShare={(file) => session.sendMessage({ text: '', file })}
                onClose={() => setPanel(null)}
              />
            )}
            {panel === 'devices' && (
              <DevicePanel
                devices={session.devices}
                selected={session.selectedDevices}
                onChoose={(kind, deviceId) => void session.chooseDevice(kind, deviceId)}
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

      {session.error && (
        <Pressable
          style={styles.errorBanner}
          onPress={() => void session.retryMedia()}
          accessibilityRole="button"
          accessibilityLabel="Try the camera and microphone again"
        >
          <Ionicons name="alert-circle" size={18} color={colors.text} />
          <Text style={styles.micBannerText}>{session.error}</Text>
        </Pressable>
      )}

      {session.localStream !== null &&
        session.localStream.getAudioTracks()[0]?.readyState !== 'live' && (
          <Pressable
            style={styles.micBanner}
            onPress={session.toggleMic}
            accessibilityRole="button"
            accessibilityLabel="Turn on microphone"
          >
            <Ionicons name="mic" size={18} color={colors.text} />
            <Text style={styles.micBannerText}>
              Tap to turn on the microphone so others can hear you
            </Text>
          </Pressable>
        )}

      <ScrollView
        horizontal={!wide}
        scrollEnabled={!wide}
        showsHorizontalScrollIndicator={false}
        style={styles.toolbarScroll}
        contentContainerStyle={[styles.toolbar, !wide && styles.toolbarRow]}
      >
        <ToolbarButton
          icon={microphoneOn(session.localStream) ? 'mic' : 'mic-off'}
          label={microphoneOn(session.localStream) ? 'Mute' : 'Unmute'}
          danger={!microphoneOn(session.localStream)}
          onPress={session.toggleMic}
        />
        <ToolbarButton
          icon={cameraOn(session.localStream) ? 'videocam' : 'videocam-off'}
          label={cameraOn(session.localStream) ? 'Stop video' : 'Start video'}
          danger={!cameraOn(session.localStream)}
          disabled={session.self.screenSharing}
          onPress={() => void session.toggleCamera()}
        />
        {showExtraTools && CAN_SHARE_SCREEN && (
          <ToolbarButton
            icon="desktop-outline"
            label={session.self.screenSharing ? 'Stop share' : 'Share screen'}
            active={session.self.screenSharing}
            onPress={() => void session.toggleScreenShare()}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon={session.self.handRaised ? 'hand-left' : 'hand-left-outline'}
            label={session.self.handRaised ? 'Lower hand' : 'Raise hand'}
            active={session.self.handRaised}
            onPress={session.toggleHand}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="happy-outline"
            label="React"
            active={reactionsOpen}
            onPress={() => setReactionsOpen((open) => !open)}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="brush"
            label="Whiteboard"
            active={stage === 'whiteboard'}
            onPress={() => toggleStage('whiteboard')}
          />
        )}
        <ToolbarButton
          icon="code-slash"
          label="Code"
          active={stage === 'code'}
          onPress={() => toggleStage('code')}
        />
        <ToolbarButton
          icon="library-outline"
          label="Probleme"
          active={panel === 'problems'}
          onPress={() => togglePanel('problems')}
        />
        {compact && (
          <ToolbarButton
            icon="ellipsis-horizontal"
            label={moreOpen ? 'Less' : 'More'}
            active={moreOpen}
            onPress={() => setMoreOpen((open) => !open)}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="people"
            label="Participants"
            active={panel === 'participants'}
            onPress={() => togglePanel('participants')}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="chatbubble-ellipses"
            label="Chat"
            active={panel === 'chat'}
            badge={unread}
            onPress={() => togglePanel('chat')}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="folder-outline"
            label="Files"
            active={panel === 'files'}
            badge={files.length}
            onPress={() => togglePanel('files')}
          />
        )}
        {showExtraTools && (
          <ToolbarButton
            icon="settings-outline"
            label="Devices"
            active={panel === 'devices'}
            onPress={() => togglePanel('devices')}
          />
        )}
        <ToolbarButton icon="exit-outline" label="Leave" danger onPress={session.leave} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
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
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '92%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    zIndex: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  micBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  micBannerText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  toolbarScroll: {
    flexGrow: 0,
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toolbarRow: {
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    flexGrow: 1,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
});
