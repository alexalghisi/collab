import { ALLOWED_MIME_TYPES } from './attachments';
import type { UploadableFile } from './upload';

export const FILE_PICKER_ACCEPT = ALLOWED_MIME_TYPES.join(',');

export function uploadableFromBrowserFile(file: File): UploadableFile {
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    uri: URL.createObjectURL(file),
    blob: file,
  };
}

export function pickBrowserFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = FILE_PICKER_ACCEPT;
    input.onchange = () => resolve([...Array.from(input.files ?? [])]);
    input.click();
  });
}
