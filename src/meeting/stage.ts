export const MEETING_STAGES = ['grid', 'whiteboard', 'code'] as const;

/** What fills the meeting body: the tiles, or a shared surface above a tile strip. */
export type MeetingStage = (typeof MEETING_STAGES)[number];

export const DEFAULT_MEETING_STAGE: MeetingStage = 'grid';

/** Keeps an unknown value out of the room's stage; the wire is not trusted. */
export function normalizeStage(value: unknown): MeetingStage | null {
  return MEETING_STAGES.includes(value as MeetingStage) ? (value as MeetingStage) : null;
}
