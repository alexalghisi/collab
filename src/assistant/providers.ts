import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { parseActions, type AssistantModel } from './types';

export type AssistantProvider = 'openai' | 'anthropic' | 'google';

const SYSTEM = [
  'You are the meeting assistant for a video call.',
  'Answer only from the supplied context. If the context does not say, say you do not know.',
  'When the question asks for action items or decisions, end with a JSON array of',
  '{ "type": "action_item" | "decision", "text": string, "owner": string | null }',
  'on its own, after a line that reads ACTIONS. Conversational answers stay plain text.',
].join(' ');

/**
 * One calling shape for OpenAI, Claude and Gemini. The rest of the assistant
 * never imports a provider package.
 */
export function createSdkModel(provider: AssistantProvider, apiKey: string): AssistantModel {
  const model = languageModel(provider, apiKey);
  return {
    async complete(prompt, context) {
      const result = await generateText({
        model,
        system: SYSTEM,
        prompt: `${prompt}\n\n${context}`,
      });
      return splitAnswer(result.text);
    },
  };
}

export function createSdkModelFromEnv(env: NodeJS.ProcessEnv = process.env): AssistantModel | null {
  const named = (env.ASSISTANT_PROVIDER ?? '').trim() as AssistantProvider | '';
  const openai = env.OPENAI_API_KEY?.trim();
  const anthropic = env.ANTHROPIC_API_KEY?.trim();
  const google = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (named === 'openai' && openai) {
    return createSdkModel('openai', openai);
  }
  if (named === 'anthropic' && anthropic) {
    return createSdkModel('anthropic', anthropic);
  }
  if (named === 'google' && google) {
    return createSdkModel('google', google);
  }
  if (openai) {
    return createSdkModel('openai', openai);
  }
  if (anthropic) {
    return createSdkModel('anthropic', anthropic);
  }
  if (google) {
    return createSdkModel('google', google);
  }
  return null;
}

function languageModel(provider: AssistantProvider, apiKey: string) {
  switch (provider) {
    case 'anthropic':
      return createAnthropic({ apiKey })('claude-sonnet-4-20250514');
    case 'google':
      return createGoogleGenerativeAI({ apiKey })('gemini-2.0-flash');
    default:
      return createOpenAI({ apiKey })('gpt-4o-mini');
  }
}

export function splitAnswer(text: string): {
  text: string;
  actions: ReturnType<typeof parseActions>;
} {
  const marker = text.lastIndexOf('\nACTIONS');
  if (marker === -1) {
    return { text: text.trim(), actions: [] };
  }
  const prose = text.slice(0, marker).trim();
  const raw = text.slice(marker + '\nACTIONS'.length).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = [];
  }
  return { text: prose, actions: parseActions(parsed) };
}
