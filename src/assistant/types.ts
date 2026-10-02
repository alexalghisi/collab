import { z } from 'zod';

export const ACTION_TYPES = ['action_item', 'decision'] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  text: z.string().min(1),
  owner: z.string().nullable(),
});

export type StructuredAction = z.infer<typeof ActionSchema>;

export const ActionListSchema = z.array(ActionSchema);

export function parseActions(input: unknown): StructuredAction[] {
  const parsed = ActionListSchema.safeParse(input);
  return parsed.success ? parsed.data : [];
}

export interface AssistantAsk {
  readonly requestId: string;
  readonly question: string;
}

export interface AssistantToken {
  readonly requestId: string;
  readonly text: string;
}

export interface AssistantDone {
  readonly requestId: string;
  readonly actions: StructuredAction[];
}

export interface AssistantFailure {
  readonly requestId: string;
  readonly error: string;
}

export interface AssistantContext {
  readonly meetingId: string;
  readonly roomId: string;
  readonly question: string;
  readonly transcript: readonly {
    readonly displayName: string;
    readonly text: string;
    readonly startedAt: number;
  }[];
  readonly messages: readonly { readonly text: string; readonly sentAt: number }[];
}

export type AssistantEvent =
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'done'; readonly text: string; readonly actions: StructuredAction[] }
  | { readonly type: 'error'; readonly error: string };

export interface AssistantModel {
  complete(prompt: string, context: string): Promise<{ text: string; actions: StructuredAction[] }>;
}
