export function programSource(editorValue: string | undefined, sharedValue: string): string {
  const typed = editorValue ?? '';
  if (typed.trim() !== '') {
    return typed;
  }
  return sharedValue;
}
