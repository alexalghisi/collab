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
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        returnKeyType="send"
        blurOnSubmit={false}
        editable={!busy}
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
        {visible.map((message) => {
          const mine = isOwnChatMessage(message, selfId, ...(selfIds ?? []));
          const file = message.file;
          const editing = editingId === message.id;
          const canSaveEdit = editDraft.trim() !== '' || Boolean(file);
          return (
            <View key={message.id} style={[styles.message, mine && styles.messageMine]}>
              <View style={styles.meta}>
                <Text style={styles.author}>{mine ? 'You' : message.displayName}</Text>
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
                      >
                        <Ionicons name="create-outline" size={14} color={colors.text} />
                      </Pressable>
                    )}
                    {onDelete && (
                      <Pressable
                        style={styles.action}
                        onPress={() => confirmDelete(() => onDelete(message.id))}
                        accessibilityRole="button"
                        accessibilityLabel="Delete message"
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.text} />
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
                  {message.text.length > 0 && <LinkedText text={message.text} />}
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
    padding: 16,
    gap: 12,
  },
  empty: {
    color: colors.textSubtle,
    textAlign: 'center',
    marginTop: 24,
  },
  message: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  author: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(249, 250, 251, 0.7)',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: 'auto',
    gap: 2,
  },
  action: {
    padding: 2,
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
    alignItems: 'center',
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
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
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
