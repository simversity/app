import { describe, expect, test } from 'bun:test';
import { validateImageMagic } from '../file-upload';

describe('validateImageMagic', () => {
  test('accepts valid PNG magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(validateImageMagic('image/png', bytes)).toBe(true);
  });

  test('rejects wrong magic bytes for PNG', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(validateImageMagic('image/png', bytes)).toBe(false);
  });

  test('accepts valid JPEG magic bytes', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(validateImageMagic('image/jpeg', bytes)).toBe(true);
  });

  test('rejects wrong magic bytes for JPEG', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    expect(validateImageMagic('image/jpeg', bytes)).toBe(false);
  });

  test('accepts valid GIF magic bytes', () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(validateImageMagic('image/gif', bytes)).toBe(true);
  });

  test('accepts valid WebP magic bytes (RIFF + WEBP)', () => {
    // RIFF....WEBP
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(validateImageMagic('image/webp', bytes)).toBe(true);
  });

  test('rejects WAV file disguised as WebP (RIFF but not WEBP)', () => {
    // RIFF....WAVE (WAV header)
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(validateImageMagic('image/webp', bytes)).toBe(false);
  });

  test('rejects file too short for magic check', () => {
    const bytes = new Uint8Array([0x89, 0x50]);
    expect(validateImageMagic('image/png', bytes)).toBe(false);
  });

  test('allows non-image types through (no magic check)', () => {
    const bytes = new Uint8Array([0x00, 0x00, 0x00]);
    expect(validateImageMagic('application/pdf', bytes)).toBe(true);
  });

  test('rejects executable disguised as JPEG', () => {
    // ELF binary header
    const bytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46]);
    expect(validateImageMagic('image/jpeg', bytes)).toBe(false);
  });
});
