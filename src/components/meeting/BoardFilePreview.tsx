import { createElement, useEffect, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes } from '../../files/attachments';
import { attachmentHref } from '../../files/urls';
import type { BoardFile } from '../../signaling/events';
import { colors } from '../../theme';
import { isTextMime, loadBoardText } from '../../whiteboard/boardText';

export interface BoardFilePreviewProps {
  readonly item: BoardFile;
  readonly owned: boolean;
  readonly onOpen: (href: string) => void;
  readonly onRemove: (id: string) => void;
}

function FileCard({ name }: { name: string }) {
  return (
    <View style={styles.card}>
      <Ionicons name="document-outline" size={28} color={colors.textMuted} />
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

function TextPreview({ id, href, name }: { id: string; href: string; name: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    loadBoardText(id, href)
      .then((loaded) => {
        if (active) {
          setText(loaded);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id, href]);

  if (failed) {
    return <FileCard name={name} />;
  }
  return (
    <ScrollView style={styles.note} contentContainerStyle={styles.noteContent}>
      <Text style={styles.noteText} selectable>
        {text ?? 'Loading…'}
      </Text>
    </ScrollView>
  );
}

function MediaPreview({
  id,
  mimeType,
  href,
  name,
}: {
  id: string;
  mimeType: string;
  href: string;
  name: string;
}) {
  if (isTextMime(mimeType)) {
    return <TextPreview id={id} href={href} name={name} />;
  }
  if (mimeType.startsWith('image/')) {
    return <Image source={{ uri: href }} style={styles.media} resizeMode="contain" />;
  }
  if (Platform.OS === 'web' && mimeType === 'application/pdf') {
    return createElement('iframe', {
      src: href,
      title: name,
      style: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    });
  }
  if (Platform.OS === 'web' && mimeType.startsWith('video/')) {
    return createElement('video', {
      src: href,
      controls: true,
      style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
    });
  }
  if (Platform.OS === 'web' && mimeType.startsWith('audio/')) {
    return createElement('audio', {
      src: href,
      controls: true,
      style: { width: '100%' },
    });
  }
  return <FileCard name={name} />;
}

export function BoardFilePreview({ item, owned, onOpen, onRemove }: BoardFilePreviewProps) {
  const href = attachmentHref(item.file.url);

  return (
    <View
      style={[
        styles.wrap,
        {
          left: `${item.x * 100}%`,
          top: `${item.y * 100}%`,
          width: `${item.w * 100}%`,
          height: `${item.h * 100}%`,
        },
      ]}
    >
      {isTextMime(item.file.mimeType) ? (
        <View style={styles.body}>
          <MediaPreview
            id={item.file.id}
            mimeType={item.file.mimeType}
            href={href}
            name={item.file.name}
          />
          <Pressable onPress={() => onOpen(href)} accessibilityRole="button">
            <Text style={styles.meta} numberOfLines={1}>
              {item.file.name} · {formatBytes(item.file.size)}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.body} onPress={() => onOpen(href)} accessibilityRole="button">
          <MediaPreview
            id={item.file.id}
            mimeType={item.file.mimeType}
            href={href}
            name={item.file.name}
          />
          <Text style={styles.meta} numberOfLines={1}>
            {item.file.name} · {formatBytes(item.file.size)}
          </Text>
        </Pressable>
      )}
      {owned && (
        <Pressable
          style={styles.remove}
          onPress={() => onRemove(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.file.name}`}
        >
          <Ionicons name="close" size={14} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 2,
  },
  body: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  media: {
    flex: 1,
    width: '100%',
    backgroundColor: '#e2e8f0',
  },
  note: {
    flex: 1,
    backgroundColor: '#fffbeb',
  },
  noteContent: {
    padding: 10,
  },
  noteText: {
    color: '#111827',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.select({
      web: 'ui-monospace, Menlo, Consolas, monospace',
      default: 'monospace',
    }),
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: colors.surfaceRaised,
  },
  name: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceRaised,
  },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
  },
});
