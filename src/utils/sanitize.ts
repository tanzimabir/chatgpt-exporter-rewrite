import path from 'node:path';

/**
 * Sanitize a filename from potentially untrusted source.
 * Falls back to basename if traversal is detected.
 */
export function sanitizeFilename(name: string): string {
  // Remove any path components — only keep the filename
  const base = path.basename(name);
  // Remove leading dots (hidden files)
  const cleaned = base.replace(/^\.+/, '');
  // Fallback if empty
  return cleaned || 'unnamed';
}

/**
 * Sanitize a relative path from OpenAI metadata.
 * Only allows simple nested paths like "dir/file.ext", rejects traversal.
 */
export function sanitizeRelativePath(input: string): string {
  const normalized = input.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const safe: string[] = [];
  for (const part of parts) {
    if (part === '..') continue; // reject traversal
    if (part.startsWith('.')) continue; // reject hidden
    safe.push(part);
  }
  return safe.length > 0 ? safe.join('/') : 'unnamed';
}
