import { Share } from 'react-native';

/** Mobile has no file downloads; hand the content to the system share sheet instead. */
export function downloadTextFile(filename: string, content: string, _mimeType: string): void {
  void Share.share({ title: filename, message: content });
}
