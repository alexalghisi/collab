import { describe, expect, it } from 'vitest';
import {
  generateRoomId,
  isUsableRoomId,
  nameSlug,
  normalizeRoomId,
  roomIdWhileTyping,
} from './roomId';

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

describe('roomIdWhileTyping', () => {
  it('turns what someone writes into something a link can carry', () => {
    expect(roomIdWhileTyping('Alghisi Raluca')).toBe('alghisi-raluca');
    expect(roomIdWhileTyping('Ședința de Luni')).toBe('sedinta-de-luni');
    expect(roomIdWhileTyping('Café Ōsaka')).toBe('cafe-osaka');
  });

  it('leaves a dash you have just typed alone, so a two-word id can be reached', () => {
    expect(roomIdWhileTyping('team-')).toBe('team-');
    expect(roomIdWhileTyping('team-sync')).toBe('team-sync');
  });

  it('never starts with a dash and never doubles one up', () => {
    expect(roomIdWhileTyping('  -- team   sync --')).toBe('team-sync-');
  });

  it('stops before an id grows longer than a phone screen', () => {
    expect(roomIdWhileTyping('a'.repeat(200))).toHaveLength(48);
  });
});

describe('normalizeRoomId', () => {
  it('tidies the dash left hanging at the end', () => {
    expect(normalizeRoomId('team-')).toBe('team');
    expect(normalizeRoomId('Alghisi Raluca ')).toBe('alghisi-raluca');
  });

  it('leaves a generated id exactly as it was', () => {
    const generated = generateRoomId('Alghisi Raluca');

    expect(normalizeRoomId(generated)).toBe(generated);
  });

  it('lands two people on the same room however they typed it', () => {
    expect(normalizeRoomId('Alghisi Raluca')).toBe(normalizeRoomId('  alghisi raluca  '));
  });
});

describe('isUsableRoomId', () => {
  it('turns down an id too short to be anything but a collision', () => {
    expect(isUsableRoomId('')).toBe(false);
    expect(isUsableRoomId('a-')).toBe(false);
    expect(isUsableRoomId('日本語')).toBe(false);
  });

  it('accepts a short word someone chose on purpose', () => {
    expect(isUsableRoomId('lab')).toBe(true);
    expect(isUsableRoomId('Alghisi Raluca')).toBe(true);
  });
});
