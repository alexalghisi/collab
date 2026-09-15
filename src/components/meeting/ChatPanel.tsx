import type { ChatDraft } from '../../chat/messages';
import type { FileAttachment } from '../../files/attachments';
import type { UploadableFile, UploadProgress } from '../../files/upload';
import type { ChatMessage } from '../../signaling/events';
import { MessageThread } from '../chat/MessageThread';
import { SidePanel } from './SidePanel';

export interface ChatPanelProps {
  messages: ChatMessage[];
  selfPeerId: string | null;
  onSend: (draft: ChatDraft) => void;
  onUpload?: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
  onClose: () => void;
}

export function ChatPanel({ messages, selfPeerId, onSend, onUpload, onClose }: ChatPanelProps) {
  return (
    <SidePanel title="Chat" onClose={onClose}>
      <MessageThread
        messages={messages}
        selfId={selfPeerId}
        onSend={onSend}
        uploadFile={onUpload}
        placeholder="Message everyone"
        emptyText="No messages yet. Say hello to everyone."
      />
    </SidePanel>
  );
}
