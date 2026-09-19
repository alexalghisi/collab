import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '../auth/types';
import { firestore } from '../firebase/app';
import type { ChatMessage } from '../signaling/events';
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
  /** False until a Firebase project is configured; channels need a shared backend. */
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

  useEffect(() => {
    if (!db) {
      return;
    }
    return subscribeChannels(db, setChannels);
  }, [db]);

  useEffect(() => {
    setMessages([]);
    if (!db || !activeChannelId) {
      return;
    }
    return subscribeMessages(db, activeChannelId, setMessages);
  }, [db, activeChannelId]);

  const create = useCallback(
    async (name: string) => {
      if (db && user) {
        await createChannel(db, name, user);
      }
    },
    [db, user],
  );

  const send = useCallback(
    async (text: string) => {
      if (db && user && activeChannelId) {
        await sendMessage(db, activeChannelId, user, text);
      }
    },
    [db, user, activeChannelId],
  );

  const edit = useCallback(
    async (id: string, text: string) => {
      if (db && user && activeChannelId) {
        await editMessage(db, activeChannelId, user, id, text);
      }
    },
    [db, user, activeChannelId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (db && user && activeChannelId) {
        await deleteMessage(db, activeChannelId, user, id);
      }
    },
    [db, user, activeChannelId],
  );

  return {
    enabled: db !== null,
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
