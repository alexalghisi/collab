import { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes } from '../../files/attachments';
import type { FileAttachment } from '../../files/attachments';
import type { SharedRoomFile } from '../../files/roomFiles';
import type { UploadableFile, UploadProgress } from '../../files/upload';
import { AttachmentError } from '../../files/upload';
import { attachmentHref } from '../../files/urls';
import { colors } from '../../theme';
import { AttachmentPreview } from '../files/AttachmentPreview';
import { FileDrop } from '../files/FileDrop';
import { SidePanel } from './SidePanel';

export interface FilesPanelProps {
  files: SharedRoomFile[];
  onUpload: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
  onShare: (file: FileAttachment) => void;
  onClose: () => void;
}

function openHref(href: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  void Linking.openURL(href);
}

export function FilesPanel({ files, onUpload, onShare, onClose }: FilesPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = files.find((entry) => entry.id === selectedId) ?? files.at(-1) ?? null;

  const share = async (picked: UploadableFile[]): Promise<void> => {
    if (picked.length === 0) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of picked) {
        onShare(await onUpload(file, () => {}));
      }
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

  return (
    <SidePanel title="Files" onClose={onClose}>
      <ScrollView contentContainerStyle={styles.body}>
        <FileDrop onFiles={(picked) => void share(picked)} disabled={busy}>
          <View style={styles.drop}>
            <Ionicons name="cloud-upload-outline" size={22} color={colors.textMuted} />
            <Text style={styles.dropLabel}>
              {busy ? 'Sharing…' : 'Drop an image, PDF or document, or click to pick one.'}
            </Text>
          </View>
        </FileDrop>
        {error && <Text style={styles.error}>{error}</Text>}
        {files.length === 0 ? (
          <Text style={styles.empty}>Nothing shared yet. Everyone in the call will see it.</Text>
        ) : (
          files.map((entry) => {
            const active = selected?.id === entry.id;
            return (
              <Pressable
                key={entry.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => setSelectedId(entry.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={entry.file.name}
              >
                <Ionicons name="document-outline" size={18} color={colors.text} />
                <View style={styles.meta}>
                  <Text style={styles.name} numberOfLines={1}>
                    {entry.file.name}
                  </Text>
                  <Text style={styles.size}>
                    {formatBytes(entry.file.size)}
                    {entry.byDisplayName ? ` · ${entry.byDisplayName}` : ''}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
        {selected && (
          <View style={styles.preview}>
            <AttachmentPreview file={selected.file} />
            <Pressable
              style={styles.open}
              onPress={() => openHref(attachmentHref(selected.file.url))}
              accessibilityRole="link"
              accessibilityLabel={`Open ${selected.file.name}`}
            >
              <Ionicons name="open-outline" size={16} color={colors.text} />
              <Text style={styles.openLabel}>Open</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SidePanel>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: 16,
    gap: 10,
  },
  drop: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
  },
  dropLabel: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  error: {
    color: colors.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  rowActive: {
    backgroundColor: colors.surfaceRaised,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  size: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  preview: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  open: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  openLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
