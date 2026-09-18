import path from 'node:path';
import type { ConversationTree, WalkedBranch, WalkedMessage } from './tree-walker.js';

export interface RenderOptions {
  includeSystemMessages: boolean;
  includeToolMessages: boolean;
  title?: string;
  date?: string;
}

export interface RenderResult {
  content: string;
  extension: string;
}

export interface Renderer {
  readonly format: string;
  render(tree: ConversationTree, options: RenderOptions): RenderResult;
}

// ─── Markdown Renderer ───────────────────────────────────────────────────────

export class MarkdownRenderer implements Renderer {
  readonly format = 'md';

  render(tree: ConversationTree, options: RenderOptions): RenderResult {
    const lines: string[] = [];

    // Title
    lines.push(`# ${tree.title}`);
    if (tree.createTime) {
      const date = new Date(tree.createTime * 1000).toISOString().split('T')[0];
      lines.push(`*${date}*`);
    }

    // Branches
    const branches = tree.branches.length > 0 ? tree.branches : [];
    for (let bi = 0; bi < branches.length; bi++) {
      const branch = branches[bi];
      if (bi > 0) {
        lines.push('');
        lines.push(`> _Branch: ${branch.branchId}_`);
        lines.push('');
      }

      let firstMessage = true;
      for (const msg of branch.messages) {
        // Filter system/tool
        if (msg.author.role === 'system' && !options.includeSystemMessages) continue;
        if (msg.author.role === 'tool' && !options.includeToolMessages) continue;

        if (!firstMessage) {
          lines.push('');
          lines.push('---');
          lines.push('');
        }
        firstMessage = false;

        const roleLabel = formatRole(msg.author.role);

        // Tool message as collapsible
        if (msg.author.role === 'tool') {
          lines.push(`<details>`);
          lines.push(`<summary>**${roleLabel}:**</summary>`);
          lines.push('');
          lines.push(msg.content?.text ?? '_No output_');
          lines.push('');
          lines.push(`</details>`);
          continue;
        }

        // System message as comment
        if (msg.author.role === 'system') {
          lines.push(`<!-- system -->`);
          lines.push(`> ${msg.content?.text ?? ''}`);
          continue;
        }

        // Regular message
        lines.push(`**${roleLabel}:**`);
        lines.push('');

        if (msg.content?.isImage) {
          // Image reference
          const parts = msg.content.parts;
          if (parts) {
            for (const part of parts) {
              if (part && typeof part === 'object') {
                const obj = part as Record<string, unknown>;
                if (obj.asset_pointer) {
                  const pointer = obj.asset_pointer as string;
                  const fileId = pointer.startsWith('file-service://') ? pointer.slice('file-service://'.length) : null;
                  if (fileId) {
                    lines.push(`![image](files/${fileId}/${fileId}.png)`);
                  } else {
                    lines.push(`![image](${pointer})`);
                  }
                }
              }
            }
          }
        } else if (msg.content?.isAudio) {
          lines.push('_Audio message_');
        } else if (msg.content?.text) {
          lines.push(msg.content.text);
        }
      }
    }

    lines.push('');
    return { content: lines.join('\n'), extension: 'md' };
  }
}

// ─── Plain Text Renderer ─────────────────────────────────────────────────────

export class TxtRenderer implements Renderer {
  readonly format = 'txt';

  render(tree: ConversationTree, options: RenderOptions): RenderResult {
    const lines: string[] = [];
    lines.push(tree.title);
    lines.push('='.repeat(tree.title.length));
    lines.push('');

    for (const branch of tree.branches) {
      for (const msg of branch.messages) {
        if (msg.author.role === 'system' && !options.includeSystemMessages) continue;
        if (msg.author.role === 'tool' && !options.includeToolMessages) continue;
        lines.push(`[${formatRole(msg.author.role)}]: ${msg.content?.text ?? ''}`);
        lines.push('');
      }
    }

    return { content: lines.join('\n'), extension: 'txt' };
  }
}

// ─── JSON Renderer ────────────────────────────────────────────────────────────

export class JsonRenderer implements Renderer {
  readonly format = 'json';

  render(tree: ConversationTree, options: RenderOptions): RenderResult {
    const branches = tree.branches.map((branch) => ({
      branchId: branch.branchId,
      messages: branch.messages
        .filter((m) => {
          if (m.author.role === 'system' && !options.includeSystemMessages) return false;
          if (m.author.role === 'tool' && !options.includeToolMessages) return false;
          return true;
        })
        .map((m) => ({
          id: m.id,
          author: m.author,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata,
        })),
    }));

    const output = {
      id: tree.id,
      title: tree.title,
      createTime: tree.createTime,
      updateTime: tree.updateTime,
      branches,
    };

    return { content: JSON.stringify(output, null, 2), extension: 'json' };
  }
}

// ─── JSONL Renderer ───────────────────────────────────────────────────────────

export class JsonlRenderer implements Renderer {
  readonly format = 'jsonl';

  render(tree: ConversationTree, options: RenderOptions): RenderResult {
    const lines: string[] = [];

    for (const branch of tree.branches) {
      for (const msg of branch.messages) {
        if (msg.author.role === 'system' && !options.includeSystemMessages) continue;
        if (msg.author.role === 'tool' && !options.includeToolMessages) continue;

        lines.push(
          JSON.stringify({
            conversationId: tree.id,
            branchId: branch.branchId,
            role: msg.author.role,
            content: msg.content?.text ?? '',
            timestamp: msg.timestamp,
          })
        );
      }
    }

    return { content: lines.join('\n'), extension: 'jsonl' };
  }
}

// ─── HTML Renderer ────────────────────────────────────────────────────────────

export class HtmlRenderer implements Renderer {
  readonly format = 'html';

  render(tree: ConversationTree, options: RenderOptions): RenderResult {
    const parts: string[] = [];
    parts.push(`<!DOCTYPE html>`);
    parts.push(`<html><head><meta charset="utf-8"><title>${escapeHtml(tree.title)}</title>`);
    parts.push(`<style>`);
    parts.push(`body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }`);
    parts.push(`h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }`);
    parts.push(`hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }`);
    parts.push(`details { background: #f8f9fa; border-radius: 6px; padding: 0.5rem 1rem; margin: 1rem 0; }`);
    parts.push(`summary { cursor: pointer; font-weight: 600; }`);
    parts.push(`.system { color: #6c757d; font-style: italic; background: #f1f3f5; padding: 0.5rem; border-left: 3px solid #adb5bd; }`);
    parts.push(`blockquote { color: #6c757d; border-left: 3px solid #dee2e6; padding-left: 1rem; margin: 1rem 0; }`);
    parts.push(`</style>`);
    parts.push(`</head><body>`);
    parts.push(`<h1>${escapeHtml(tree.title)}</h1>`);
    if (tree.createTime) {
      const date = new Date(tree.createTime * 1000).toISOString().split('T')[0];
      parts.push(`<p><em>${date}</em></p>`);
    }

    for (const branch of tree.branches) {
      if (branch.branchId !== 'branch-001') {
        parts.push(`<blockquote>Branch: ${branch.branchId}</blockquote>`);
      }

      let firstMessage = true;
      for (const msg of branch.messages) {
        if (msg.author.role === 'system' && !options.includeSystemMessages) continue;
        if (msg.author.role === 'tool' && !options.includeToolMessages) continue;

        if (!firstMessage) parts.push(`<hr>`);
        firstMessage = false;

        const roleLabel = formatRole(msg.author.role);

        if (msg.author.role === 'system') {
          parts.push(`<div class="system"><strong>${roleLabel}:</strong> ${escapeHtml(msg.content?.text ?? '')}</div>`);
        } else if (msg.author.role === 'tool') {
          parts.push(`<details><summary><strong>${roleLabel}</strong></summary><pre>${escapeHtml(msg.content?.text ?? '_No output_')}</pre></details>`);
        } else {
          parts.push(`<p><strong>${roleLabel}:</strong></p>`);
          if (msg.content?.isImage) {
            parts.push(`<p><em>[Image]</em></p>`);
          } else if (msg.content?.isAudio) {
            parts.push(`<p><em>[Audio]</em></p>`);
          } else {
            // Preserve line breaks
            const textLines = (msg.content?.text ?? '').split('\n').map((l) => escapeHtml(l)).join('<br>\n');
            parts.push(`<p>${textLines}</p>`);
          }
        }
      }
    }

    parts.push(`</body></html>`);
    return { content: parts.join('\n'), extension: 'html' };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatRole(role: string): string {
  switch (role) {
    case 'user': return 'User';
    case 'assistant': return 'Assistant';
    case 'system': return 'System';
    case 'tool': return 'Tool';
    default: return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Registry ─────────────────────────────────────────────────────────────────

const renderers = new Map<string, Renderer>([
  ['md', new MarkdownRenderer()],
  ['markdown', new MarkdownRenderer()],
  ['txt', new TxtRenderer()],
  ['text', new TxtRenderer()],
  ['json', new JsonRenderer()],
  ['jsonl', new JsonlRenderer()],
  ['html', new HtmlRenderer()],
]);

export function getRenderer(format: string): Renderer {
  const r = renderers.get(format.toLowerCase());
  if (!r) {
    throw new Error(`Unknown format: ${format}. Available: ${Array.from(renderers.keys()).join(', ')}`);
  }
  return r;
}

export function getAvailableFormats(): string[] {
  // Return unique formats (md and markdown are same, etc.)
  return ['md', 'txt', 'json', 'jsonl', 'html'];
}
