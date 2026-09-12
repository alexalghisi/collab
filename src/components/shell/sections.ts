import type { IconName } from '../ui/icons';

export type Section = 'home' | 'meetings' | 'calendar';

export interface SectionItem {
  readonly id: Section;
  readonly label: string;
  readonly icon: IconName;
}

export const SECTIONS: readonly SectionItem[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'meetings', label: 'Meetings', icon: 'videocam' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
];
