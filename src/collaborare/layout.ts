export const PROBLEMS_PANEL_WIDTH_KEY = 'collab.problems.width';
export const DEFAULT_PANEL_WIDTH = 440;
/** Width saved before the column was widened; treated as "still the default". */
const PREVIOUS_DEFAULT_PANEL_WIDTH = 380;
export const MIN_PANEL_WIDTH = 280;

/** Phones and a 768px-wide frame use a tab instead of a side column. */
export const COMPACT_PROBLEM_WIDTH = 768;

export function isCompactProblemLayout(width: number): boolean {
  return width <= COMPACT_PROBLEM_WIDTH;
}

/**
 * Keeps the problems column on screen: at least the minimum, and never more
 * than 60% of the code stage. A narrow stage shrinks the minimum to fit.
 */
export function clampPanelWidth(requested: number, stageWidth: number): number {
  const max = Math.max(160, Math.floor(stageWidth * 0.6));
  const min = Math.min(MIN_PANEL_WIDTH, max);
  const width = Number.isFinite(requested) ? requested : DEFAULT_PANEL_WIDTH;
  return Math.min(max, Math.max(min, Math.round(width)));
}

export function readPanelWidth(raw: string | null, stageWidth: number): number {
  const stored = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  const parsed =
    !Number.isFinite(stored) || stored === PREVIOUS_DEFAULT_PANEL_WIDTH
      ? DEFAULT_PANEL_WIDTH
      : stored;
  return clampPanelWidth(parsed, stageWidth);
}
