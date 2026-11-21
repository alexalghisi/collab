import type { CodeLanguage } from './languages';
import { programSource } from './programSource';

export interface EditorRunSource {
  language: () => CodeLanguage;
  source: () => string;
}

let selected: CodeLanguage | null = null;
let editor: EditorRunSource | null = null;

export function rememberRunLanguage(language: CodeLanguage): void {
  selected = language;
}

export function bindEditorRun(next: EditorRunSource | null): void {
  editor = next;
}

export function resetEditorRun(): void {
  selected = null;
  editor = null;
}

export function editorRunProgram(fallback: { language: CodeLanguage; source: string }): {
  language: CodeLanguage;
  code: string;
} {
  const language = editor?.language() ?? selected ?? fallback.language;
  const onScreen = editor?.source();
  return {
    language,
    code: programSource(onScreen, fallback.source),
  };
}
