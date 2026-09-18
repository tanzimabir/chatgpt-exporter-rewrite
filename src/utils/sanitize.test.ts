import { describe, it, expect } from 'vitest';
import { sanitizeFilename, sanitizeRelativePath } from '../utils/sanitize';

describe('sanitizeFilename', () => {
  it('replaces path separators with underscores', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('.._.._etc_passwd');
  });

  it('removes control characters', () => {
    expect(sanitizeFilename('hello\x00world.txt')).toBe('helloworld.txt');
  });

  it('trims dots and spaces from start/end', () => {
    expect(sanitizeFilename('.hidden.')).toBe('hidden');
    expect(sanitizeFilename('  trim  ')).toBe('trim');
  });

  it('defaults to "unnamed" for empty strings', () => {
    expect(sanitizeFilename('')).toBe('unnamed');
    expect(sanitizeFilename('...')).toBe('unnamed');
  });

  it('preserves valid filenames', () => {
    expect(sanitizeFilename('conversation-2024.md')).toBe('conversation-2024.md');
    expect(sanitizeFilename('Chat_John.txt')).toBe('Chat_John.txt');
  });
});

describe('sanitizeRelativePath', () => {
  it('allows simple filenames', () => {
    expect(sanitizeRelativePath('image.png')).toBe('image.png');
    expect(sanitizeRelativePath('dir/file.txt')).toBe('dir/file.txt');
  });

  it('returns null for absolute paths', () => {
    expect(sanitizeRelativePath('/etc/passwd')).toBeNull();
    expect(sanitizeRelativePath('C:\\Windows\\System32')).toBeNull();
  });

  it('returns null for paths with .. traversal', () => {
    expect(sanitizeRelativePath('../etc/passwd')).toBeNull();
    expect(sanitizeRelativePath('foo/../../../etc/passwd')).toBeNull();
  });

  it('returns null for empty strings', () => {
    expect(sanitizeRelativePath('')).toBeNull();
  });
});
