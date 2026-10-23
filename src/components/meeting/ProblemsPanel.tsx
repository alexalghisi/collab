import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import catalogJson from '../../collaborare/catalog.json';
import { catalogCategories, filterCatalog } from '../../collaborare/filter';
import type { CatalogItem, CatalogKind } from '../../collaborare/types';
import { colors } from '../../theme';
import { SidePanel } from './SidePanel';

const catalog = catalogJson.items as CatalogItem[];

export interface ProblemsPanelProps {
  onOpen: (problem: CatalogItem) => void;
  onClose: () => void;
}

type KindFilter = 'all' | CatalogKind;

export function ProblemsPanel({ onOpen, onClose }: ProblemsPanelProps) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [category, setCategory] = useState('all');
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const categories = useMemo(() => catalogCategories(catalog), []);
  const rows = useMemo(
    () => filterCatalog(catalog, { text, kind, category }),
    [text, kind, category],
  );

  const choose = (item: CatalogItem): void => {
    if (item.kind === 'announcement') {
      setOpenSlug((current) => (current === item.slug ? null : item.slug));
      return;
    }
    onOpen(item);
  };

  return (
    <SidePanel title="Probleme" onClose={onClose}>
      <View style={styles.filters}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Caută o problemă sau un anunț"
          placeholderTextColor={colors.textSubtle}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="Toate" active={kind === 'all'} onPress={() => setKind('all')} />
          <Chip label="Probleme" active={kind === 'problem'} onPress={() => setKind('problem')} />
          <Chip
            label="Anunțuri"
            active={kind === 'announcement'}
            onPress={() => setKind('announcement')}
          />
          <Chip
            label="Orice categorie"
            active={category === 'all'}
            onPress={() => setCategory('all')}
          />
          {categories.map((name) => (
            <Chip
              key={name}
              label={name}
              active={category === name}
              onPress={() => setCategory(name)}
            />
          ))}
        </ScrollView>
        <Text style={styles.count}>{rows.length} rezultate de pe collaborare.ro</Text>
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.slice(0, 80).map((item) => {
          const expanded = openSlug === item.slug;
          return (
            <Pressable
              key={item.slug}
              style={styles.row}
              onPress={() => choose(item)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <Text style={styles.kind}>{item.kind === 'announcement' ? 'Anunț' : 'Problemă'}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta} numberOfLines={expanded ? undefined : 2}>
                {[item.category, item.topic, item.limits].filter(Boolean).join(' · ')}
              </Text>
              {expanded && item.statement !== '' && (
                <Text style={styles.body}>{item.statement}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SidePanel>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  search: {
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: {
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  count: {
    color: colors.textMuted,
    fontSize: 12,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  row: {
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    padding: 12,
    gap: 4,
  },
  kind: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  body: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
});
