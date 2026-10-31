import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { consoleText } from '../../code/consoleText';
import type { CodeRun } from '../../hooks/useCollabSession';
import { LANGUAGE_LABELS } from '../../code/languages';
import { colors } from '../../theme';

export interface CodeOutputProps {
  runs: CodeRun[];
}

function statusOf(run: CodeRun): { text: string; color: string } {
  if (run.running) {
    return { text: 'running', color: colors.textMuted };
  }
  if (run.error) {
    return { text: run.error, color: colors.danger };
  }
  if (run.timedOut) {
    return { text: 'timed out', color: colors.warning };
  }
  return run.exitCode === 0
    ? { text: 'finished', color: colors.success }
    : { text: `exit ${run.exitCode}`, color: colors.warning };
}

/** The latest run only. Older runs stay out of the console. */
export function CodeOutput({ runs }: CodeOutputProps) {
  const run = runs.at(-1);
  if (!run) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Output from Run appears here for everyone.</Text>
      </View>
    );
  }

  const status = statusOf(run);
  return (
    <View style={styles.console}>
      <View style={styles.header}>
        <Text style={styles.author}>
          {run.byDisplayName} · {LANGUAGE_LABELS[run.language]}
        </Text>
        {run.running && <ActivityIndicator size="small" color={colors.textMuted} />}
        <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
      </View>
      <Text style={styles.streamLabel}>stdout</Text>
      <Text style={styles.stdout}>{consoleText(run.stdout)}</Text>
      {run.stderr !== '' && (
        <>
          <Text style={styles.streamLabel}>stderr</Text>
          <Text style={styles.stderr}>{run.stderr}</Text>
        </>
      )}
      {run.files.length > 0 && (
        <Text style={styles.files}>wrote {run.files.map((file) => file.name).join(', ')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyText: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  console: {
    flexShrink: 0,
    minHeight: 88,
    maxHeight: 220,
    overflow: 'scroll',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  author: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  status: {
    fontSize: 12,
  },
  streamLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  stdout: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  stderr: {
    color: colors.danger,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  files: {
    color: colors.success,
    fontFamily: 'monospace',
    fontSize: 12,
  },
});
