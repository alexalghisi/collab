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

/** Images and PDFs first, plus the other kinds the room already accepts. */
export const FILE_PICKER_ACCEPT = [
  'image/*',
  'application/pdf',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.heic',
  '.zip',
  '.txt',
  '.csv',
  '.md',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp3',
  '.wav',
  '.mp4',
  '.webm',
  '.mov',
].join(',');

export function configureFileInput(input: { multiple: boolean; accept: string }): void {
  input.multiple = true;
  input.accept = FILE_PICKER_ACCEPT;
}

export function pickBrowserFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    configureFileInput(input);
    input.onchange = () => resolve([...Array.from(input.files ?? [])]);
    input.click();
  });
}
