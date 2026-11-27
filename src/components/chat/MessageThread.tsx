import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  isOwnChatMessage,
  MAX_MESSAGE_CHARS,
  visibleChatMessages,
  type ChatDraft,
} from '../../chat/messages';
import { formatBytes } from '../../files/attachments';
import { pickBrowserFiles, uploadableFromBrowserFile } from '../../files/browser';
import type { FileAttachment } from '../../files/attachments';
import type { UploadableFile, UploadProgress } from '../../files/upload';
import { AttachmentError } from '../../files/upload';
import { attachmentHref } from '../../files/urls';
import { formatTime } from '../../meeting/calendar';
import type { ChatMessage } from '../../signaling/events';
import { colors } from '../../theme';
import { FileDrop } from '../files/FileDrop';
import { chatInitial, sendsOnKey, startsChatGroup } from '../../chat/layout';
import { LinkedText } from './LinkedText';

export interface MessageThreadProps {
  messages: ChatMessage[];
  /** Messages whose `peerId` matches are rendered as our own. */
  selfId: string | null;
  /** Extra ids that also count as "me" (meeting session id vs live socket id). */
  selfIds?: readonly (string | null)[];
  onSend: (draft: ChatDraft) => void;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  uploadFile?: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
  placeholder: string;
  emptyText: string;
}

function openHref(href: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(href);
}

function confirmDelete(onConfirm: () => void): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm('Delete this message?')) {
      onConfirm();
    }
    return;
  }
  Alert.alert('Delete message?', 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
}

const COMPOSER_MIN_HEIGHT = 42;
const COMPOSER_MAX_HEIGHT = 148;

function composerHeight(contentHeight: number): number {
  return Math.min(COMPOSER_MAX_HEIGHT, Math.max(COMPOSER_MIN_HEIGHT, Math.ceil(contentHeight) + 2));
}

/** Scrolling message list with a composer; used by the meeting chat and team channels. */
export function MessageThread({
  messages,
  selfId,
  selfIds,
  onSend,
  onEdit,
  onDelete,
  uploadFile,
  placeholder,
  emptyText,
}: MessageThreadProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);
  const listRef = useRef<ScrollView>(null);
  const visible = visibleChatMessages(messages);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [visible.length]);

  const submit = (): void => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    onSend({ text, file: null });
    setDraft('');
    setInputHeight(COMPOSER_MIN_HEIGHT);
    setError(null);
  };

  const share = async (files: UploadableFile[]): Promise<void> => {
    if (!uploadFile || files.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const attachment = await uploadFile(file, () => {});
        onSend({ text: draft.trim(), file: attachment });
      }
      setDraft('');
    } catch (cause) {
      setError(
        cause instanceof AttachmentError || cause instanceof Error
          ? cause.message
          : 'The file could not be shared.',
      );
    } finally {
      setBusy(false);
    }
  };

  const composer = (
    <View style={styles.composer}>
      {uploadFile && (
        <Pressable
          style={styles.attach}
          onPress={() => {
            if (typeof document === 'undefined') {
              return;
            }
            void pickBrowserFiles().then((picked) => share(picked.map(uploadableFromBrowserFile)));
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
        >
          <Ionicons name="attach" size={20} color={colors.text} />
        </Pressable>
      )}
      <TextInput
        style={[styles.input, { height: inputHeight }]}
        value={draft}
        onChangeText={(next) => {
          setDraft(next);
          if (next === '') {
            setInputHeight(COMPOSER_MIN_HEIGHT);
          }
        }}
        onContentSizeChange={(event) =>
          setInputHeight(composerHeight(event.nativeEvent.contentSize.height))
        }
        onKeyPress={(event) => {
          if (sendsOnKey(event.nativeEvent)) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        maxLength={MAX_MESSAGE_CHARS}
        multiline
        textAlignVertical="top"
        blurOnSubmit={false}
        editable={!busy}
        accessibilityLabel={placeholder}
      />
      <Pressable
        style={[styles.send, !draft.trim() && styles.sendDisabled]}
        onPress={submit}
        disabled={!draft.trim() || busy}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <Ionicons name="send" size={18} color={colors.text} />
      </Pressable>
    </View>
  );

  return (
    <>
      <ScrollView ref={listRef} contentContainerStyle={styles.list}>
        {visible.length === 0 && <Text style={styles.empty}>{emptyText}</Text>}
        {visible.map((message, index) => {
          const mine = isOwnChatMessage(message, selfId, ...(selfIds ?? []));
          const file = message.file;
          const editing = editingId === message.id;
          const canSaveEdit = editDraft.trim() !== '' || Boolean(file);
          const opensGroup = startsChatGroup(visible[index - 1], message);
          return (
            <View
              key={message.id}
              style={[styles.row, mine && styles.rowMine, opensGroup && styles.rowSpaced]}
              testID="chat-message"
            >
              {!mine &&
                (opensGroup ? (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{chatInitial(message.displayName)}</Text>
                  </View>
                ) : (
                  <View style={styles.avatarGap} />
                ))}
              <View
                style={[
                  styles.message,
                  mine ? styles.messageMine : styles.messageTheirs,
                  opensGroup && (mine ? styles.messageMineFirst : styles.messageTheirsFirst),
                ]}
              >
                <View style={styles.meta}>
                  {opensGroup && (
                    <Text style={[styles.author, !mine && styles.authorTheirs]}>
                      {mine ? 'You' : message.displayName}
                    </Text>
                  )}
                  <Text style={styles.time}>{formatTime(message.sentAt)}</Text>
                  {message.editedAt && !editing && <Text style={styles.time}>edited</Text>}
                  {mine && (onEdit || onDelete) && !editing && (
                    <View style={styles.actions}>
                      {onEdit && (
                        <Pressable
                          style={styles.action}
                          onPress={() => {
                            setEditingId(message.id);
                            setEditDraft(message.text);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Edit message"
                          hitSlop={8}
                        >
                          <Ionicons name="create-outline" size={15} color={colors.text} />
                        </Pressable>
                      )}
                      {onDelete && (
                        <Pressable
                          style={styles.action}
                          onPress={() => confirmDelete(() => onDelete(message.id))}
                          accessibilityRole="button"
                          accessibilityLabel="Delete message"
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={15} color={colors.text} />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
                {editing ? (
                  <>
                    <TextInput
                      style={styles.editInput}
                      value={editDraft}
                      onChangeText={setEditDraft}
                      onSubmitEditing={() => {
                        if (!canSaveEdit || !onEdit) {
                          return;
                        }
                        onEdit(message.id, editDraft.trim());
                        setEditingId(null);
                      }}
                      maxLength={MAX_MESSAGE_CHARS}
                      autoFocus
                      multiline
                      textAlignVertical="top"
                      returnKeyType="done"
                      blurOnSubmit
                    />
                    <View style={styles.editActions}>
                      <Pressable
                        onPress={() => setEditingId(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Cancel edit"
                      >
                        <Text style={styles.editActionText}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          if (!canSaveEdit || !onEdit) {
                            return;
                          }
                          onEdit(message.id, editDraft.trim());
                          setEditingId(null);
                        }}
                        disabled={!canSaveEdit}
                        accessibilityRole="button"
                        accessibilityLabel="Save edit"
                      >
                        <Text
                          style={[styles.editActionText, !canSaveEdit && styles.editActionDisabled]}
                        >
                          Save
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    {message.text.length > 0 && <LinkedText text={message.text} mine={mine} />}
                    {file && (
                      <Pressable
                        style={styles.file}
                        onPress={() => openHref(attachmentHref(file.url))}
                        accessibilityRole="link"
                        accessibilityLabel={`Download ${file.name}`}
                      >
                        <Ionicons name="document-outline" size={16} color={colors.text} />
                        <Text style={styles.fileName} numberOfLines={1}>
                          {file.name}
                        </Text>
                        <Text style={styles.fileSize}>{formatBytes(file.size)}</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {error && <Text style={styles.error}>{error}</Text>}
      {uploadFile ? (
        <FileDrop onFiles={(files) => void share(files)} disabled={busy} clickToPick={false}>
          {composer}
        </FileDrop>
      ) : (
        composer
      )}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 3,
  },
  empty: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowMine: {
    justifyContent: 'flex-end',
  },
  rowSpaced: {
    marginTop: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  avatarText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  avatarGap: {
    width: 28,
  },
  message: {
    flexShrink: 1,
    minWidth: 84,
    maxWidth: '86%',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 9,
    gap: 4,
  },
  messageTheirs: {
    backgroundColor: '#1e293b',
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  messageTheirsFirst: {
    borderTopLeftRadius: 5,
  },
  messageMine: {
    backgroundColor: '#1d4ed8',
    borderColor: 'rgba(147, 197, 253, 0.35)',
  },
  messageMineFirst: {
    borderTopRightRadius: 5,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 8,
    minHeight: 18,
  },
  author: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  authorTheirs: {
    color: '#7dd3fc',
  },
  time: {
    color: 'rgba(249, 250, 251, 0.62)',
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 2,
  },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
  },
  editInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  editActionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  editActionDisabled: {
    opacity: 0.5,
  },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  fileName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  fileSize: {
    color: 'rgba(249, 250, 251, 0.7)',
    fontSize: 12,
  },
  error: {
    color: '#f87171',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attach: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderWidth: 1,
    borderRadius: 14,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: {
    backgroundColor: colors.primaryDisabled,
  },
});
