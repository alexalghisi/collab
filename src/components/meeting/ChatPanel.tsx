import type { ChatMessage } from '../../signaling/events';
import { MessageThread } from '../chat/MessageThread';
import { SidePanel } from './SidePanel';

export interface ChatPanelProps {
  messages: ChatMessage[];
  selfPeerId: string | null;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function ChatPanel({ messages, selfPeerId, onSend, onClose }: ChatPanelProps) {
  return (
    <SidePanel title="Chat" onClose={onClose}>
      <MessageThread
        messages={messages}
        selfId={selfPeerId}
        onSend={onSend}
        placeholder="Message everyone"
        emptyText="No messages yet. Say hello to everyone."
      />
    </SidePanel>
  );
}
