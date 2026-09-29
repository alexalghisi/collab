import { createElement } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FileAttachment } from '../../files/attachments';
import { attachmentHref } from '../../files/urls';
import { colors } from '../../theme';

export interface AttachmentPreviewProps {
  readonly file: FileAttachment;
}

export function AttachmentPreview({ file }: AttachmentPreviewProps) {
  const href = attachmentHref(file.url);

  if (file.mimeType.startsWith('image/')) {
    return <Image source={{ uri: href }} style={styles.media} resizeMode="contain" />;
  }
  if (Platform.OS === 'web' && file.mimeType === 'application/pdf') {
    return createElement('iframe', {
      src: href,
      title: file.name,
      style: { width: '100%', height: '100%', border: 'none', background: '#fff' },
    });
  }
  if (Platform.OS === 'web' && file.mimeType.startsWith('video/')) {
    return createElement('video', {
      src: href,
      controls: true,
      style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' },
    });
  }
  if (Platform.OS === 'web' && file.mimeType.startsWith('audio/')) {
    return createElement('audio', {
      src: href,
      controls: true,
      style: { width: '100%' },
    });
  }

  return (
    <View style={styles.card}>
      <Ionicons name="document-outline" size={28} color={colors.textMuted} />
      <Text style={styles.name} numberOfLines={2}>
        {file.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  media: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e2e8f0',
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
});
