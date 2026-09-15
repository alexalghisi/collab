import { View } from 'react-native';
import type { FileDropProps } from './file-drop';

export type { FileDropProps };

/** Native builds have no OS file drag target. */
export function FileDrop({ children }: FileDropProps) {
  return <View>{children}</View>;
}
