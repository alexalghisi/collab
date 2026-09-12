import {
  ATTACHMENT_REJECTION_MESSAGES,
  MAX_FILE_BYTES,
  isAllowedMimeType,
  type FileAttachment,
} from './attachments';

/** A file the participant picked, before anything has been read from it. */
export interface UploadableFile {
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
  readonly uri: string;
  /** Set on web, where the picker hands over the file itself. */
  readonly blob?: Blob;
}

export type UploadProgress = (fraction: number) => void;

/** Anything the participant should be shown rather than only logged. */
export class AttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentError';
  }
}

/**
 * The same limits the server applies, applied early so the picker can say no
 * before spending someone's upstream bandwidth. The server still decides.
 */
export function assertUploadable(file: UploadableFile): void {
  if (file.size > MAX_FILE_BYTES) {
    throw new AttachmentError(ATTACHMENT_REJECTION_MESSAGES['file-too-large']);
  }
  if (!isAllowedMimeType(file.mimeType)) {
    throw new AttachmentError(ATTACHMENT_REJECTION_MESSAGES['unsupported-type']);
  }
}

/** React Native has no File, and sends a picked file as this shape instead. */
interface NativeFilePart {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
}

function partOf(file: UploadableFile): Blob {
  const part: Blob | NativeFilePart = file.blob ?? {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  };
  return part as Blob;
}

export async function readBlob(file: UploadableFile): Promise<Blob> {
  if (file.blob) {
    return file.blob;
  }
  return await (await fetch(file.uri)).blob();
}

/**
 * Posts a picked file as multipart. XMLHttpRequest rather than fetch because
 * fetch cannot report how far an upload has got, and an upload with no progress
 * looks broken long before it is.
 */
export function postFile(
  url: string,
  file: UploadableFile,
  fields: Record<string, string>,
  onProgress: UploadProgress,
): Promise<FileAttachment> {
  assertUploadable(file);

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  form.append('file', partOf(file), file.name);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    request.onerror = () => reject(new AttachmentError('The upload could not reach the server.'));
    request.onabort = () => reject(new AttachmentError('The upload was cancelled.'));
    request.onload = () => {
      if (request.status === 201) {
        onProgress(1);
        resolve(JSON.parse(request.responseText) as FileAttachment);
        return;
      }
      reject(new AttachmentError(errorOf(request.responseText)));
    };
    request.send(form);
  });
}

function errorOf(body: string): string {
  try {
    const { error } = JSON.parse(body) as { error?: string };
    return error ?? 'The file could not be shared.';
  } catch {
    return 'The file could not be shared.';
  }
}
