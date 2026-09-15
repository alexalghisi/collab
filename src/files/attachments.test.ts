import { describe, expect, it } from 'vitest';
import { isAllowedMimeType, isPreviewableMime, mimeOf } from './attachments';

describe('file types', () => {
  it('accepts a pasted screenshot and a document, and refuses a script', () => {
    expect(isAllowedMimeType('image/png')).toBe(true);
    expect(isAllowedMimeType('application/pdf')).toBe(true);
    expect(isAllowedMimeType('application/octet-stream')).toBe(true);
    expect(isAllowedMimeType('application/x-sh')).toBe(false);
  });

  it('fills in a type from the file name when the OS left it blank', () => {
    expect(mimeOf('notes.docx', '')).toContain('wordprocessingml');
    expect(mimeOf('shot.png', 'application/octet-stream')).toBe('image/png');
  });

  it('marks images and PDFs as previewable', () => {
    expect(isPreviewableMime('image/jpeg')).toBe(true);
    expect(isPreviewableMime('application/pdf')).toBe(true);
    expect(isPreviewableMime('application/zip')).toBe(false);
  });
});
