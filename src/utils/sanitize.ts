import path from 'node:path';

/**
 * Sanitize a filename from potentially untrusted source.
 * - Replaces path separators with underscores
 * - Removes control characters
 * - Trims whitespace
 * - Strips leading single dot (hidden file pattern) only if not part of `..` traversal
 * - Strips trailing single dot only if not part of `...` pattern
 * - Falls back to "unnamed" if nothing remains
 */
export function sanitizeFilename(name: string): string {
  if (!name) return 'unnamed';

  // Replace path separators with underscores
  let cleaned = name.replace(/[\\/]/g, '_');
  // Remove control characters (0x00-0x1F, 0x7F)
  cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, '');
  // Trim whitespace
  cleaned = cleaned.trim();

  // Strip leading dot only for hidden file patterns (`.name`), not `..` traversal
  if (cleaned.length > 1 && cleaned[0] === '.' && cleaned[1] !== '.') {
    cleaned = cleaned.slice(1);
  }

  // Strip trailing dot only if preceded by non-dot
  if (cleaned.length > 1 && cleaned[cleaned.length - 1] === '.' && cleaned[cleaned.length - 2] !== '.') {
    cleaned = cleaned.slice(0, -1);
  }

  // Fallback if only dots/spaces remain
  if (!cleaned || cleaned.replace(/[.\s]/g, '') === '') return 'unnamed';

  return cleaned;
}

/**
 * Sanitize a relative path from OpenAI metadata.
 * Returns null for:
 * - Absolute paths (start with / or drive letter)
 * - Paths containing .. (directory traversal)
 * - Empty strings
 * Otherwise returns the cleaned relative path.
 */
export function sanitizeRelativePath(input: string): string {
  if (!input) return null;

  // Reject absolute paths
  if (input.startsWith('/') || /^[a-zA-Z]:/.test(input)) return null;

  const parts = input.replace(/\\/g, '/').split('/').filter(Boolean);
  const safe: string[] = [];
  for (const part of parts) {
    if (part === '..') return null; // reject traversal entirely
    if (part.startsWith('.')) continue; // skip hidden
    safe.push(part);
  }
  return safe.length > 0 ? safe.join('/') : null;
}
