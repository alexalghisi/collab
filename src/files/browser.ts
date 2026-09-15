import { mimeOf } from './attachments';
import type { UploadableFile } from './upload';

export function uploadableFromBrowserFile(file: File): UploadableFile {
  return {
    name: file.name,
    mimeType: mimeOf(file.name, file.type),
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
    input.onchange = () => resolve([...Array.from(input.files ?? [])]);
    input.click();
  });
}
