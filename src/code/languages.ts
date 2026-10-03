/** Languages the shared editor offers and the execution service can run. */
export const CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'go', 'cpp'] as const;

export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export const DEFAULT_CODE_LANGUAGE: CodeLanguage = 'javascript';

export const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  go: 'Go',
  cpp: 'C++',
};

export function isCodeLanguage(value: unknown): value is CodeLanguage {
  return CODE_LANGUAGES.includes(value as CodeLanguage);
}

export function languageFromSource(source: string): CodeLanguage | null {
  const text = source.trimStart();
  if (/^#\s*include\b/.test(text) || /^using\s+namespace\s+std\b/m.test(text)) {
    return 'cpp';
  }
  if (/^package\s+main\b/.test(text)) {
    return 'go';
  }
  return null;
}

export function resolveRunLanguage(declared: CodeLanguage, source: string): CodeLanguage {
  if (declared !== DEFAULT_CODE_LANGUAGE) {
    return declared;
  }
  return languageFromSource(source) ?? declared;
}
