import type { CodeLanguage } from '../code/languages';
import { encodeUpdate } from '../code/updates';
import { problemPageUrl } from './types';

/** Fragment key collaborare.ro reads on a problem page (`#collab=…`). */
export const HANDOFF_PARAM = 'collab';

type JudgedLanguage = Extract<CodeLanguage, 'cpp' | 'python'>;

/** Languages collaborare.ro's judge accepts. */
function isJudged(language: CodeLanguage): language is JudgedLanguage {
  return language === 'cpp' || language === 'python';
}

/**
 * What collaborare.ro needs to put the code in its editor and submit it.
 * Keep in sync with `src/lib/collab-handoff.ts` in alexalghisi/oi-info-solvers.
 */
interface SubmitHandoff {
  readonly v: 1;
  readonly lang: JudgedLanguage;
  readonly code: string;
  readonly submit: true;
}

function toBase64Url(text: string): string {
  return encodeUpdate(new TextEncoder().encode(text))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The collaborare.ro problem page link that fills its editor with this code and
 * submits it. The code rides in the URL fragment, so it never reaches a server
 * log. Null when the site cannot judge the language or there is nothing to send.
 */
export function submitHandoffUrl(
  slug: string,
  language: CodeLanguage,
  code: string,
): string | null {
  if (!isJudged(language) || code.trim() === '') {
    return null;
  }
  const payload: SubmitHandoff = {
    v: 1,
    lang: language,
    code,
    submit: true,
  };
  return `${problemPageUrl(slug)}#${HANDOFF_PARAM}=${toBase64Url(JSON.stringify(payload))}`;
}

/** What pressing "Submit on collaborare.ro" did. */
export type SubmitOutcome = 'sent' | 'copied' | 'opened';

export const SUBMIT_NOTES: Readonly<Record<SubmitOutcome, string>> = {
  sent: 'Sent to collaborare.ro: your code is in its editor and is being submitted. Sign in there if asked.',
  copied:
    'collaborare.ro judges C++ and Python only. Code copied: paste it there and press Submit.',
  opened: 'Opened on collaborare.ro. Copy your code from the editor and submit there.',
};
