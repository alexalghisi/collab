import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBytes } from '../../files/attachments';
import { useFileLibrary } from '../../files/useFileLibrary';
import { colors } from '../../theme';
import { FileDrop } from '../files/FileDrop';

export interface FilesCardProps {
  readonly ownerId: string;
}

export function FilesCard({ ownerId }: FilesCardProps) {
  const library = useFileLibrary(ownerId);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Files</Text>
      <Text style={styles.subtitle}>Drop a PDF, image or zip here, or click to pick one.</Text>
      <FileDrop onFiles={(files) => void library.add(files)} disabled={library.busy}>
        <View style={styles.drop}>
          <Ionicons name="cloud-upload-outline" size={28} color={colors.textMuted} />
          <Text style={styles.dropLabel}>
            {library.busy ? 'Adding…' : 'Drag and drop, or click to upload'}
          </Text>
        </View>
      </FileDrop>
      {library.error && <Text style={styles.error}>{library.error}</Text>}
      {library.files.length === 0 ? (
        <Text style={styles.empty}>Nothing here yet.</Text>
      ) : (
        library.files.map((file) => (
          <View key={file.id} style={styles.row}>
            <Ionicons name="document-outline" size={18} color={colors.text} />
            <View style={styles.meta}>
              <Text style={styles.name} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={styles.size}>{formatBytes(file.size)}</Text>
            </View>
            <Pressable
              onPress={() => void library.download(file.id, file.name)}
              accessibilityRole="button"
              accessibilityLabel={`Download ${file.name}`}
            >
              <Ionicons name="download-outline" size={18} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => void library.remove(file.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${file.name}`}
            >
              <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  drop: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 22,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.background,
  },
  dropLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  error: {
    color: '#f87171',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
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
});
