import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
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

/** Every run in the room, whoever started it, newest last. */
export function CodeOutput({ runs }: CodeOutputProps) {
  if (runs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Output from Run appears here for everyone.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.console} contentContainerStyle={styles.consoleContent}>
      {runs.map((run) => {
        const status = statusOf(run);
        return (
          <View key={run.runId} style={styles.run}>
            <View style={styles.header}>
              <Text style={styles.author}>
                {run.byDisplayName} · {LANGUAGE_LABELS[run.language]}
              </Text>
              {run.running && <ActivityIndicator size="small" color={colors.textMuted} />}
              <Text style={[styles.status, { color: status.color }]}>{status.text}</Text>
            </View>
            {run.stdout !== '' && <Text style={styles.stdout}>{run.stdout}</Text>}
            {run.stderr !== '' && <Text style={styles.stderr}>{run.stderr}</Text>}
          </View>
        );
      })}
    </ScrollView>
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
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  consoleContent: {
    padding: 12,
    gap: 12,
  },
  run: {
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
});
