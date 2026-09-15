import { View } from 'react-native';
import type { BoardSurfaceProps } from './board-surface';

export type { BoardPoint, BoardSurfaceProps } from './board-surface';

export function BoardSurface({ children }: BoardSurfaceProps) {
  return <View style={{ flex: 1 }}>{children}</View>;
}
