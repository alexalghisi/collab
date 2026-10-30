import { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ExampleVerdict } from '../../collaborare/examples';
import { CATEGORY_OLYMPIAD, formatMemoryLimit, formatTimeLimit } from '../../collaborare/filter';
import { parseStatement, type StatementSpan } from '../../collaborare/markdown';
import {
  COLLABORARE_SITE,
  problemPageUrl,
  type ProblemCategory,
  type ProblemDetail,
  type ProblemSummary,
} from '../../collaborare/types';
import { colors } from '../../theme';

const SUBMIT_HINT =
  'Copies your code and opens this problem on collaborare.ro, where you are signed in: paste it there and submit.';

export interface ProblemsPanelProps {
  problems: readonly ProblemSummary[];
  loading: boolean;
  error: string | null;
  stale: boolean;
  categories: readonly ProblemCategory[];
  grades: readonly number[];
  levels: readonly string[];
  text: string;
  category: string;
  olympGrade: number | null;
  olympLevel: string | null;
  slug: string | null;
  detail: ProblemDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  followHost: boolean;
  isHost: boolean;
  history: readonly string[];
  verdicts: readonly ExampleVerdict[];
  examplesRunning: boolean;
  confirming: boolean;
  onText: (text: string) => void;
  onCategory: (key: string) => void;
  onOlympGrade: (grade: number | null) => void;
  onOlympLevel: (level: string | null) => void;
  onSelect: (slug: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onRandom: () => void;
  onFollowHost: (follow: boolean) => void;
  onLoad: () => void;
  onConfirmLoad: (replace: boolean) => void;
  onRunExamples: () => void;
  /** Copies the editor code and opens the problem on collaborare.ro; resolves true when copied. */
  onSubmit: () => Promise<boolean>;
  onClose: () => void;
}

export function ProblemsPanel(props: ProblemsPanelProps) {
  const {
    problems,
    loading,
    error,
    stale,
    categories,
    grades,
    levels,
    text,
    category,
    olympGrade,
    olympLevel,
    slug,
    detail,
    detailLoading,
    detailError,
    followHost,
    isHost,
    history,
    verdicts,
    examplesRunning,
    confirming,
    onText,
    onCategory,
    onOlympGrade,
    onOlympLevel,
    onSelect,
    onPrev,
    onNext,
    onRandom,
    onFollowHost,
    onLoad,
    onConfirmLoad,
    onRunExamples,
    onSubmit,
    onClose,
  } = props;
  const [listing, setListing] = useState(slug === null);
  const [submitNote, setSubmitNote] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      setListing(false);
    }
  }, [slug]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev]);

  const page = slug ? problemPageUrl(slug) : COLLABORARE_SITE;
  const titleFor = (item: string): string =>
    problems.find((problem) => problem.slug === item)?.title ??
    (detail?.slug === item ? detail.title : item);

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          Probleme
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Hide problems"
          style={styles.headerButton}
        >
          <Text style={styles.headerButtonText}>Hide</Text>
        </Pressable>
      </View>
      <View style={styles.followRow}>
        <Pressable
          onPress={() => onFollowHost(!followHost)}
          accessibilityRole="switch"
          accessibilityLabel={followHost ? 'Stop following the host' : 'Follow the host'}
          accessibilityState={{ checked: followHost }}
          style={[styles.chip, followHost && styles.chipActive]}
        >
          <Text style={styles.chipText}>
            {followHost
              ? isHost
                ? 'Sharing with the room'
                : 'Following the host'
              : 'Browsing freely'}
          </Text>
        </Pressable>
      </View>
      {listing && (
        <>
          <TextInput
            value={text}
            onChangeText={onText}
            placeholder="Search problems"
            placeholderTextColor={colors.textSubtle}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search problems"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroll}
          >
            {categories.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => onCategory(item.key)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: category === item.key }}
                style={[styles.chip, category === item.key && styles.chipActive]}
              >
                <Text style={styles.chipText}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {category === CATEGORY_OLYMPIAD && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
            >
              <Chip
                label="Toate clasele"
                active={olympGrade === null}
                onPress={() => onOlympGrade(null)}
              />
              {grades.map((grade) => (
                <Chip
                  key={grade}
                  label={`a ${grade}-a`}
                  active={olympGrade === grade}
                  onPress={() => onOlympGrade(grade)}
                />
              ))}
              <Chip
                label="Orice etapă"
                active={olympLevel === null}
                onPress={() => onOlympLevel(null)}
              />
              {levels.map((level) => (
                <Chip
                  key={level}
                  label={level.toUpperCase()}
                  active={olympLevel === level}
                  onPress={() => onOlympLevel(level)}
                />
              ))}
            </ScrollView>
          )}
        </>
      )}
      {error && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{error}</Text>
          <Pressable
            onPress={() => void Linking.openURL(page)}
            accessibilityRole="link"
            accessibilityLabel="Open collaborare.ro"
          >
            <Text style={styles.link}>Open collaborare.ro</Text>
          </Pressable>
        </View>
      )}
      {stale && !error && (
        <Text style={styles.note}>Showing the saved list. The catalog could not be refreshed.</Text>
      )}
      <View style={styles.nav}>
        <NavButton
          label="◀ Prev"
          a11yLabel="Previous problem"
          hint="Alt+Left"
          onPress={onPrev}
          disabled={problems.length === 0}
        />
        <NavButton
          label="Next ▶"
          a11yLabel="Next problem"
          hint="Alt+Right"
          onPress={onNext}
          disabled={problems.length === 0}
        />
        <NavButton
          label="Random"
          hint="Pick another problem"
          onPress={onRandom}
          disabled={problems.length === 0}
        />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {loading && <Text style={styles.note}>Loading problems…</Text>}
        {!loading && problems.length === 0 && !error && (
          <Text style={styles.note}>No problems match this search.</Text>
        )}
        {listing &&
          problems.map((problem) => (
            <ProblemRow
              key={problem.slug}
              problem={problem}
              selected={problem.slug === slug}
              onPress={() => onSelect(problem.slug)}
            />
          ))}
        {detailLoading && <Text style={styles.note}>Loading the statement…</Text>}
        {detailError && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{detailError}</Text>
            <Pressable
              onPress={() => void Linking.openURL(page)}
              accessibilityRole="link"
              accessibilityLabel="Open this problem on collaborare.ro"
            >
              <Text style={styles.link}>Open on collaborare.ro</Text>
            </Pressable>
          </View>
        )}
        {!listing && detail && (
          <View>
            <Text style={styles.title} accessibilityRole="header" aria-level={2}>
              {detail.title}
            </Text>
            <Text style={styles.meta}>{limitLine(detail)}</Text>
            <Statement source={detail.statement} />
            {detail.formulas.map((formula) => (
              <Text key={formula} style={styles.formula} accessibilityLabel={`Formula ${formula}`}>
                {formula}
              </Text>
            ))}
            {detail.images.map((image) => (
              <Image
                key={image.url}
                source={{ uri: image.url }}
                accessibilityLabel={image.alt === '' ? 'Problem figure' : image.alt}
                style={styles.figure}
                resizeMode="contain"
              />
            ))}
            {detail.inputFormat !== '' && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={3}>
                  Input
                </Text>
                <Statement source={detail.inputFormat} />
              </View>
            )}
            {detail.outputFormat !== '' && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={3}>
                  Output
                </Text>
                <Statement source={detail.outputFormat} />
              </View>
            )}
            {detail.constraints !== '' && (
              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle} accessibilityRole="header" aria-level={3}>
                  Constraints
                </Text>
                <Statement source={detail.constraints} />
              </View>
            )}
            {verdicts.length > 0 && (
              <Text
                style={verdicts.every((item) => item.passed) ? styles.pass : styles.fail}
                accessibilityRole="summary"
                accessibilityLiveRegion="polite"
              >
                {verdicts.filter((item) => item.passed).length}/{verdicts.length} examples passed
              </Text>
            )}
            {detail.examples.map((example, index) => (
              <View key={`${example.input}-${index}`} style={styles.example}>
                <Text style={styles.exampleTitle}>Example {index + 1}</Text>
                <Text style={styles.code}>
                  Input{'\n'}
                  {example.input}
                </Text>
                <Text style={styles.code}>
                  Output{'\n'}
                  {example.output}
                </Text>
                {example.explanation ? (
                  <Text style={styles.note}>{example.explanation}</Text>
                ) : null}
                {verdicts[index] && (
                  <View accessibilityLabel={`Example ${index + 1} verdict`}>
                    <Text style={verdicts[index].passed ? styles.pass : styles.fail}>
                      {verdicts[index].passed ? 'Passed' : 'Failed'}
                      {verdicts[index].error ? ` — ${verdicts[index].error}` : ''}
                    </Text>
                    {!verdicts[index].passed && !verdicts[index].error && (
                      <Text style={styles.code}>
                        Your output{'\n'}
                        {verdicts[index].actual === '' ? '(empty)' : verdicts[index].actual}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            ))}
            {history.length > 1 && (
              <View style={styles.history}>
                <Text style={styles.exampleTitle}>Opened in this session</Text>
                {history.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => onSelect(item)}
                    accessibilityRole="button"
                    accessibilityLabel={titleFor(item)}
                  >
                    <Text style={styles.link}>{titleFor(item)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      {confirming && (
        <View style={styles.confirm} accessibilityRole="alert">
          <Text style={styles.bannerText}>Replace the code in the editor with this starter?</Text>
          <View style={styles.nav}>
            <NavButton
              label="Replace"
              hint="Overwrite the editor"
              onPress={() => onConfirmLoad(true)}
            />
            <NavButton
              label="Keep"
              hint="Leave the editor as it is"
              onPress={() => onConfirmLoad(false)}
            />
          </View>
        </View>
      )}
      <View style={styles.actions}>
        <NavButton
          label="Back to list"
          hint="Show the problem list"
          onPress={() => setListing(true)}
          disabled={listing}
        />
        <NavButton
          label="Load into editor"
          hint="Insert a C++ or Python starter and the example input"
          onPress={onLoad}
          disabled={!detail}
        />
        <NavButton
          label={examplesRunning ? 'Running examples…' : 'Run on examples'}
          hint="Run the editor against each example"
          onPress={onRunExamples}
          disabled={!detail || detail.examples.length === 0 || examplesRunning}
        />
        <Pressable
          onPress={() => void Linking.openURL(page)}
          accessibilityRole="link"
          accessibilityLabel="Open on collaborare.ro"
          style={styles.action}
        >
          <Text style={styles.actionText}>Open on collaborare.ro</Text>
        </Pressable>
        <Pressable
          disabled={!detail}
          onPress={() => {
            void onSubmit().then((copied) =>
              setSubmitNote(
                copied
                  ? 'Code copied. Paste it in the editor on collaborare.ro and press Submit.'
                  : 'Opened on collaborare.ro. Copy your code from the editor and submit there.',
              ),
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Submit on collaborare.ro"
          accessibilityHint={SUBMIT_HINT}
          accessibilityState={{ disabled: !detail }}
          style={[styles.action, !detail && styles.actionDisabled]}
        >
          <Text style={styles.actionText}>Submit on collaborare.ro</Text>
        </Pressable>
        {submitNote && <Text style={styles.note}>{submitNote}</Text>}
      </View>
    </View>
  );
}

function Spans({ spans }: { spans: readonly StatementSpan[] }) {
  return (
    <>
      {spans.map((span, index) => (
        <Text
          key={index}
          style={
            span.kind === 'code'
              ? styles.inlineCode
              : span.kind === 'bold'
                ? styles.bold
                : undefined
          }
        >
          {span.text}
        </Text>
      ))}
    </>
  );
}

/** A statement in collaborare.ro's Markdown subset: headings, paragraphs, bullets, code. */
function Statement({ source }: { source: string }) {
  return (
    <View>
      {parseStatement(source).map((block, index) => {
        if (block.kind === 'code') {
          return (
            <Text key={index} style={styles.code}>
              {block.text}
            </Text>
          );
        }
        if (block.kind === 'heading') {
          return (
            <Text
              key={index}
              style={styles.statementHeading}
              accessibilityRole="header"
              aria-level={Math.min(6, block.level + 1)}
            >
              <Spans spans={block.spans} />
            </Text>
          );
        }
        return (
          <Text key={index} style={styles.statement}>
            {block.kind === 'bullet' ? '•  ' : null}
            <Spans spans={block.spans} />
          </Text>
        );
      })}
    </View>
  );
}

function limitLine(problem: ProblemSummary): string {
  const time = formatTimeLimit(problem.timeLimitMs);
  const memory = formatMemoryLimit(problem.memoryLimitKb);
  const tests = problem.testsCount === null ? null : `${problem.testsCount} tests`;
  // Non-breaking spaces keep "256 MB" and "2 s" on one line in a narrow column.
  return [problem.topic, problem.source, time, memory, tests]
    .filter(Boolean)
    .map((part) => String(part).replace(/ (?=\S+$)/, '\u00a0'))
    .join(' · ');
}

function ProblemRow({
  problem,
  selected,
  onPress,
}: {
  problem: ProblemSummary;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={problem.title}
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <Text style={styles.rowTitle}>{problem.title}</Text>
      <Text style={styles.meta}>{limitLine(problem)}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function NavButton({
  label,
  a11yLabel,
  hint,
  onPress,
  disabled = false,
}: {
  label: string;
  a11yLabel?: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={[styles.action, disabled && styles.actionDisabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  followRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  search: {
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
  },
  chipScroll: {
    flexGrow: 0,
    marginTop: 8,
  },
  chips: {
    gap: 8,
    paddingHorizontal: 12,
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
  banner: {
    marginHorizontal: 12,
    marginTop: 8,
    gap: 4,
  },
  bannerText: {
    color: colors.text,
    fontSize: 13,
  },
  note: {
    color: colors.textMuted,
    fontSize: 12,
    marginHorizontal: 12,
    marginTop: 6,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    padding: 12,
    gap: 8,
  },
  row: {
    borderRadius: 10,
    backgroundColor: colors.surfaceRaised,
    padding: 10,
    gap: 4,
  },
  rowSelected: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  statement: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  formula: {
    color: colors.text,
    fontFamily: 'monospace',
    backgroundColor: colors.surfaceRaised,
    padding: 8,
    marginTop: 8,
  },
  figure: {
    width: '100%',
    height: 180,
    marginTop: 8,
    backgroundColor: colors.surfaceRaised,
  },
  sectionBlock: {
    marginTop: 12,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  statementHeading: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    backgroundColor: colors.background,
  },
  bold: {
    fontWeight: '700',
  },
  example: {
    marginTop: 10,
    gap: 4,
  },
  exampleTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  code: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
    backgroundColor: colors.background,
    padding: 8,
  },
  pass: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  fail: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  history: {
    marginTop: 12,
    gap: 4,
  },
  link: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  confirm: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: {
    borderRadius: 8,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
