import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { MeetingSearch } from '../../search/useMeetingSearch';
import { colors } from '../../theme';
import { Button } from '../ui/Button';

export interface SearchScreenProps {
  search: MeetingSearch;
}

export function SearchScreen({ search }: SearchScreenProps) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Meeting search</Text>
      <Text style={styles.lede}>
        Finds passages in past transcripts, notes and chat. The same index the in-call assistant
        uses.
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={search.query}
          onChangeText={search.setQuery}
          onSubmitEditing={() => void search.run()}
          placeholder="billing queue, Thursday ship, …"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="search"
        />
        <Button
          label={search.loading ? 'Searching…' : 'Search'}
          onPress={() => void search.run()}
          disabled={search.loading}
        />
      </View>
      {search.error && <Text style={styles.error}>{search.error}</Text>}
      {search.hits.length === 0 && !search.error && !search.loading && (
        <Text style={styles.empty}>
          No results yet. Ask a question after a meeting has been indexed.
        </Text>
      )}
      {search.hits.map((hit) => (
        <Pressable key={hit.id} style={styles.hit} accessibilityRole="text">
          <Text style={styles.meta}>
            {hit.source} · {hit.roomId}
          </Text>
          <Text style={styles.text}>{hit.text}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 16,
    maxWidth: 960,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  lede: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#f87171',
  },
  empty: {
    color: colors.textSubtle,
    fontSize: 14,
  },
  hit: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  text: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
