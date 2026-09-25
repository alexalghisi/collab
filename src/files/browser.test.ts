import { describe, expect, it } from 'vitest';
import { configureFileInput, FILE_PICKER_ACCEPT } from './browser';

describe('configureFileInput', () => {
  it('accepts several images and PDFs in one pick', () => {
    const input = { multiple: false, accept: '' };

    configureFileInput(input);

    expect(input.multiple).toBe(true);
    expect(input.accept).toBe(FILE_PICKER_ACCEPT);
    expect(input.accept).toContain('image/*');
    expect(input.accept).toContain('application/pdf');
  });
});
