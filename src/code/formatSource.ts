import type { CodeLanguage } from './languages';
import type { WorkspaceFile } from './workspaceFiles';

const INDENT = '  ';
const PYTHON_INDENT = '    ';

const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'else',
  'do',
  'try',
  'new',
  'typeof',
  'await',
  'async',
  'const',
  'let',
  'var',
  'class',
  'struct',
  'enum',
  'int',
  'void',
  'bool',
  'char',
  'long',
  'float',
  'double',
  'public',
  'private',
  'protected',
  'namespace',
  'using',
  'func',
  'package',
  'import',
  'from',
  'export',
  'default',
  'case',
  'throw',
  'break',
  'continue',
  'sizeof',
  'template',
  'typename',
  'auto',
]);

const SPACED = new Set([
  '=',
  '==',
  '===',
  '!=',
  '!==',
  '<',
  '>',
  '<=',
  '>=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '=>',
  '<<',
  '>>',
  '?',
]);

const UNARY = new Set(['+', '-', '!', '~', '*', '&']);

export function languageForFileName(name: string): CodeLanguage | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ts')) {
    return 'typescript';
  }
  if (lower.endsWith('.js')) {
    return 'javascript';
  }
  if (lower.endsWith('.py')) {
    return 'python';
  }
  if (lower.endsWith('.go')) {
    return 'go';
  }
  if (/\.(cpp|cc|cxx|h|hpp)$/.test(lower)) {
    return 'cpp';
  }
  return null;
}

export function applyFormattedCode(
  language: CodeLanguage,
  shared: { text: { toString(): string }; replaceText: (next: string) => void },
  files: readonly WorkspaceFile[],
  openFile: WorkspaceFile | null,
  onFilesChange: (files: WorkspaceFile[]) => void,
): void {
  if (openFile) {
    const fileLanguage = languageForFileName(openFile.name);
    if (!fileLanguage) {
      return;
    }
    const content = formatSource(fileLanguage, openFile.content);
    if (content === openFile.content) {
      return;
    }
    onFilesChange(files.map((file) => (file.name === openFile.name ? { ...file, content } : file)));
    return;
  }
  shared.replaceText(formatSource(language, shared.text.toString()));
}

export function formatSource(language: CodeLanguage, source: string): string {
  if (source === '') {
    return '';
  }
  if (language === 'python') {
    return formatPython(source);
  }
  return formatClike(source, language);
}

function formatPython(source: string): string {
  const lines = source.replace(/\t/g, PYTHON_INDENT).replace(/\r\n/g, '\n').split('\n');
  let indent = 0;
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      if (out.length === 0 || out[out.length - 1] === '') {
        continue;
      }
      out.push('');
      continue;
    }
    if (/^(def |class |async def |import |from |@)/.test(line)) {
      indent = 0;
    } else if (/^(elif |else:|except|finally:|except )/.test(line)) {
      indent = Math.max(0, indent - 1);
    }
    out.push(PYTHON_INDENT.repeat(indent) + line);
    if (line.endsWith(':') && !line.startsWith('#')) {
      indent += 1;
    }
  }
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out.join('\n');
}

interface Token {
  readonly kind: 'code' | 'string' | 'comment' | 'preproc';
  readonly value: string;
}

function formatClike(source: string, language: CodeLanguage): string {
  const tokens = tokenize(source, language);
  return printClike(tokens);
}

function tokenize(source: string, language: CodeLanguage): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const js = language === 'javascript' || language === 'typescript';

  const push = (kind: Token['kind'], value: string): void => {
    if (value !== '') {
      tokens.push({ kind, value });
    }
  };

  while (i < source.length) {
    const ch = source[i];
    const prev = lastCode(tokens);

    if (ch === '#' && language === 'cpp' && startsLine(tokens)) {
      const start = i;
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      push('preproc', source.slice(start, i).trim());
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      const start = i;
      i += 2;
      while (i < source.length && source[i] !== '\n') {
        i += 1;
      }
      push('comment', source.slice(start, i).trimEnd());
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      const start = i;
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i += 1;
      }
      i = Math.min(source.length, i + 2);
      push('comment', source.slice(start, i));
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      push('string', readQuoted(source, i));
      i += tokens[tokens.length - 1].value.length;
      continue;
    }

    if (js && ch === '/' && canStartRegex(prev)) {
      push('string', readRegex(source, i));
      i += tokens[tokens.length - 1].value.length;
      continue;
    }

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    const op = readOperator(source, i);
    if (op) {
      push('code', op);
      i += op.length;
      continue;
    }

    if ('(){}[];,'.includes(ch)) {
      push('code', ch);
      i += 1;
      continue;
    }

    const start = i;
    i += 1;
    while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) {
      i += 1;
    }
    push('code', source.slice(start, i));
  }
  return tokens;
}

function lastCode(tokens: Token[]): string {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (tokens[index].kind === 'code') {
      return tokens[index].value;
    }
  }
  return '';
}

function startsLine(tokens: Token[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const last = tokens[tokens.length - 1];
  return last.kind === 'preproc' || last.value === ';' || last.value === '{' || last.value === '}';
}

function readQuoted(source: string, start: number): string {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === quote) {
      return source.slice(start, i + 1);
    }
    if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') {
          depth += 1;
        } else if (source[i] === '}') {
          depth -= 1;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return source.slice(start);
}

function readRegex(source: string, start: number): string {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === '/') {
      i += 1;
      while (i < source.length && /[a-z]/i.test(source[i])) {
        i += 1;
      }
      return source.slice(start, i);
    }
    if (source[i] === '\n') {
      break;
    }
    i += 1;
  }
  return source.slice(start, start + 1);
}

function canStartRegex(prev: string): boolean {
  return (
    prev === '' ||
    prev === '(' ||
    prev === '=' ||
    prev === ',' ||
    prev === ':' ||
    prev === '!' ||
    prev === '&' ||
    prev === '|' ||
    prev === '?' ||
    prev === '{' ||
    prev === '}' ||
    prev === ';' ||
    prev === 'return' ||
    prev === '=>'
  );
}

function readOperator(source: string, i: number): string | null {
  const slice = source.slice(i, i + 3);
  const three = ['===', '!==', '>>>'];
  if (three.includes(slice)) {
    return slice;
  }
  const two = source.slice(i, i + 2);
  const ops = [
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '=>',
    '<<',
    '>>',
    '++',
    '--',
    '->',
    '::',
  ];
  if (ops.includes(two)) {
    return two;
  }
  if ('=+-*/%<>!?:.&|^~'.includes(source[i])) {
    return source[i];
  }
  return null;
}

function printClike(tokens: Token[]): string {
  let indent = 0;
  let paren = 0;
  let out = '';
  let atLineStart = true;
  let prev = '';
  let prevKind: Token['kind'] | '' = '';

  const newline = (): void => {
    if (out.endsWith('\n') || out === '') {
      atLineStart = true;
      return;
    }
    out += '\n';
    atLineStart = true;
  };

  const pad = (): void => {
    if (atLineStart) {
      out += INDENT.repeat(Math.max(0, indent));
      atLineStart = false;
    }
  };

  const space = (): void => {
    if (!atLineStart && !out.endsWith(' ') && !out.endsWith('\n') && out !== '') {
      out += ' ';
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1]?.value ?? '';

    if (token.kind === 'preproc') {
      newline();
      out += token.value;
      newline();
      prev = token.value;
      prevKind = token.kind;
      continue;
    }

    if (token.kind === 'comment') {
      if (token.value.startsWith('//')) {
        space();
        pad();
        out += token.value;
        newline();
      } else {
        pad();
        out += token.value;
        if (token.value.includes('\n')) {
          newline();
        } else {
          space();
        }
      }
      prev = token.value;
      prevKind = token.kind;
      continue;
    }

    if (token.kind === 'string') {
      pad();
      out += token.value;
      prev = token.value;
      prevKind = token.kind;
      continue;
    }

    const value = token.value;

    if (value === '{') {
      space();
      pad();
      out += '{';
      if (next === '}') {
        prev = value;
        prevKind = token.kind;
        continue;
      }
      indent += 1;
      newline();
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === '}') {
      indent = Math.max(0, indent - 1);
      newline();
      pad();
      out += '}';
      if (next === ';' || next === ',') {
        prev = value;
        prevKind = token.kind;
        continue;
      }
      if (next === 'else' || next === 'catch' || next === 'finally' || next === 'while') {
        space();
      } else {
        newline();
      }
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === '(') {
      if (KEYWORDS.has(prev) && prev !== 'return') {
        space();
      }
      pad();
      out += '(';
      paren += 1;
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === ')') {
      pad();
      out += ')';
      paren = Math.max(0, paren - 1);
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === ',') {
      out += ',';
      space();
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === ';') {
      out += ';';
      if (paren === 0) {
        newline();
      } else {
        space();
      }
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === '++' || value === '--') {
      pad();
      out += value;
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === '.' || value === '->' || value === '::') {
      out += value;
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (value === ':') {
      out += ':';
      space();
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (SPACED.has(value) || (UNARY.has(value) && isBinary(prev, prevKind))) {
      space();
      pad();
      out += value;
      space();
      prev = value;
      prevKind = token.kind;
      continue;
    }

    if (UNARY.has(value)) {
      if (KEYWORDS.has(prev) || prev === '') {
        space();
      }
      pad();
      out += value;
      prev = value;
      prevKind = token.kind;
      continue;
    }

    pad();
    if (needsSpaceBeforeIdent(prev, prevKind, value)) {
      space();
      pad();
    }
    out += value;
    prev = value;
    prevKind = token.kind;
  }

  return out.replace(/[ \t]+\n/g, '\n').replace(/\n+$/g, '');
}

function isBinary(prev: string, prevKind: Token['kind'] | ''): boolean {
  if (prevKind === 'string') {
    return true;
  }
  if (prev === ')' || prev === ']') {
    return true;
  }
  return /[A-Za-z0-9_$'"]/.test(prev.slice(-1));
}

function needsSpaceBeforeIdent(prev: string, prevKind: Token['kind'] | '', value: string): boolean {
  if (
    prev === '' ||
    prev === '(' ||
    prev === '.' ||
    prev === '->' ||
    prev === '::' ||
    prev === '!'
  ) {
    return false;
  }
  if (prevKind === 'string') {
    return true;
  }
  if (KEYWORDS.has(prev)) {
    return true;
  }
  if (SPACED.has(prev) || UNARY.has(prev)) {
    return false;
  }
  if (/[A-Za-z0-9_$]/.test(prev.slice(-1)) && /[A-Za-z0-9_$]/.test(value[0] ?? '')) {
    return true;
  }
  return /[A-Za-z0-9_$]/.test(value[0] ?? '') && (prev === ')' || prev === ']');
}
