import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthUser } from '../auth/types';
import { firestore } from '../firebase/app';
import type { ChatMessage } from '../signaling/events';
import { messagesToRing, playChatBell } from './bell';
import {
  createChannel,
  deleteMessage,
  editMessage,
  sendMessage,
  subscribeChannels,
  subscribeMessages,
  type Channel,
} from './channels';

export interface TeamChat {
  /** True whenever a user is present; backed by Firestore when configured, or local browser storage. */
  readonly enabled: boolean;
  readonly channels: Channel[];
  readonly activeChannelId: string | null;
  readonly messages: ChatMessage[];
  selectChannel: (channelId: string | null) => void;
  createChannel: (name: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  edit: (id: string, text: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useTeamChat(user: AuthUser | null): TeamChat {
  const db = user ? firestore : null;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  const selfId = user?.uid ?? null;

  useEffect(() => {
    return subscribeChannels(db, (nextChannels) => {
      setChannels(nextChannels);
      setActiveChannelId((current) => {
        if (current && nextChannels.some((c) => c.id === current)) {
          return current;
        }
        return nextChannels[0]?.id ?? null;
      });
    });
  }, [db]);

  useEffect(() => {
    messagesRef.current = [];
    setMessages([]);
    if (!activeChannelId) {
      return;
    }
    let primed = false;
    return subscribeMessages(db, activeChannelId, (next) => {
      if (primed && messagesToRing(messagesRef.current, next, [selfId], Date.now()).length > 0) {
        playChatBell();
      }
      primed = true;
      messagesRef.current = next;
      setMessages(next);
    });
  }, [db, activeChannelId, selfId]);

  const create = useCallback(
    async (name: string) => {
      if (user) {
        const res = await createChannel(db, name, user);
        if (res && typeof res === 'object' && 'id' in res && typeof res.id === 'string') {
          setActiveChannelId(res.id);
        }
      }
    },
    [db, user],
  );

  const send = useCallback(
    async (text: string) => {
      if (user && activeChannelId) {
        await sendMessage(db, activeChannelId, user, text);
      }
    },
    [db, user, activeChannelId],
  );

  const edit = useCallback(
    async (id: string, text: string) => {
      if (user && activeChannelId) {
        await editMessage(db, activeChannelId, user, id, text);
      }
    },
    [db, user, activeChannelId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (user && activeChannelId) {
        await deleteMessage(db, activeChannelId, user, id);
      }
    },
    [db, user, activeChannelId],
  );

  return {
    enabled: user !== null,
    channels,
    activeChannelId,
    messages,
    selectChannel: setActiveChannelId,
    createChannel: create,
    send,
    edit,
    remove,
  };
}
