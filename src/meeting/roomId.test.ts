import { describe, expect, it } from 'vitest';
import { generateRoomId, nameSlug } from './roomId';

describe('nameSlug', () => {
  it('reads a name back as the part of an id a person recognises', () => {
    expect(nameSlug('Alghisi Raluca')).toBe('alghisi-raluca');
  });

  it('drops the diacritics a link cannot carry', () => {
    expect(nameSlug('Ștefan Țurcanu')).toBe('stefan-turcanu');
    expect(nameSlug('Renée Müller')).toBe('renee-muller');
  });

  it('keeps the first two words, so a long name still fits a line', () => {
    expect(nameSlug('Alghisi Alessandro Paolo')).toBe('alghisi-alessandro');
  });

  it('cuts a word that is longer than a line of its own', () => {
    expect(nameSlug('Schwarzeneggerson Bob')).toBe('schwarzenegg-bob');
  });

  it('turns anything that is not a letter into a separator', () => {
    expect(nameSlug("  O'Brien,  Mary-Jane ")).toBe('obrien-mary');
  });

  it('keeps digits that are part of the name', () => {
    expect(nameSlug('Sprint 42 review')).toBe('sprint-42');
  });

  it('comes back empty when there is nothing readable left', () => {
    expect(nameSlug('')).toBe('');
    expect(nameSlug('   ')).toBe('');
    expect(nameSlug('日本語')).toBe('');
  });
});

describe('generateRoomId', () => {
  it('puts the name in front of the number', () => {
    expect(generateRoomId('Alghisi Raluca')).toMatch(/^alghisi-raluca-\d{6}$/);
  });

  it('tells two meetings of the same person apart', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRoomId('Alghisi Raluca')));

    expect(ids.size).toBeGreaterThan(45);
  });

  it('falls back to the old letter triplets with no name to use', () => {
    expect(generateRoomId()).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(generateRoomId('')).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(generateRoomId('日本語')).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it('stays something a person can type: lowercase letters, digits and dashes', () => {
    expect(generateRoomId("Ștefan O'Brien")).toMatch(/^[a-z0-9-]+$/);
  });
});
