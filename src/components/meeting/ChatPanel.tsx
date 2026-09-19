import type { ChatDraft } from '../../chat/messages';
import type { FileAttachment } from '../../files/attachments';
import type { UploadableFile, UploadProgress } from '../../files/upload';
import type { ChatMessage } from '../../signaling/events';
import { MessageThread } from '../chat/MessageThread';
import { SidePanel } from './SidePanel';

export interface ChatPanelProps {
  messages: ChatMessage[];
  selfPeerId: string | null;
  selfSessionId?: string | null;
  onSend: (draft: ChatDraft) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onUpload?: (file: UploadableFile, onProgress: UploadProgress) => Promise<FileAttachment>;
  onClose: () => void;
}

export function ChatPanel({
  messages,
  selfPeerId,
  selfSessionId,
  onSend,
  onEdit,
  onDelete,
  onUpload,
  onClose,
}: ChatPanelProps) {
  return (
    <SidePanel title="Chat" onClose={onClose}>
      <MessageThread
        messages={messages}
        selfId={selfPeerId}
        selfIds={[selfSessionId ?? null]}
        onSend={onSend}
        onEdit={onEdit}
        onDelete={onDelete}
        uploadFile={onUpload}
        placeholder="Message everyone"
        emptyText="No messages yet. Say hello to everyone."
      />
    </SidePanel>
  );
}
