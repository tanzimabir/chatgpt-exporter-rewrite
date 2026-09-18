import {
  MappingNodeSchema,
  MessageSchema,
  type ConversationDetail,
} from './types.js';

export interface WalkedBranch {
  /** Unique identifier for this branch */
  branchId: string;
  /** Sequence of messages (system, user, assistant, tool) */
  messages: WalkedMessage[];
}

export interface WalkedMessage {
  id: string;
  author: {
    role: string;
    name?: string | null;
  };
  content?: {
    contentType: string;
    text: string;
    parts?: unknown[];
    isImage: boolean;
    isAudio: boolean;
  };
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

export interface ConversationTree {
  id: string;
  title: string;
  createTime?: number;
  updateTime?: number;
  currentNode?: string;
  branches: WalkedBranch[];
}

/**
 * Walk a conversation's mapping tree and return all branches.
 * When `includeAllBranches` is false, only the main branch (current_node path) is returned.
 */
export function walkConversationTree(
  detail: ConversationDetail,
  includeAllBranches = true
): ConversationTree {
  const branches: WalkedBranch[] = [];

  if (includeAllBranches && detail.mapping) {
    // Find root nodes (no parent)
    const roots = Object.entries(detail.mapping)
      .filter(([_, node]) => !node.parent)
      .map(([id, _]) => id);

    for (const rootId of roots) {
      const paths = traceAllPaths(detail.mapping, rootId);
      for (const path of paths) {
        const messages = path
          .map((nodeId) => detail.mapping[nodeId]?.message)
          .filter((m): m is NonNullable<typeof m> => !!m)
          .map(toWalkedMessage)
          .filter((m) => m.content !== null);

        if (messages.length > 0) {
          branches.push({
            branchId: `branch-${String(branches.length + 1).padStart(3, '0')}`,
            messages,
          });
        }
      }
    }
  } else {
    // Only main branch via current_node
    const path = traceMainPath(detail.mapping, detail.current_node);
    const messages = path
      .map((nodeId) => detail.mapping[nodeId]?.message)
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map(toWalkedMessage)
      .filter((m) => m.content !== null);

    if (messages.length > 0) {
      branches.push({
        branchId: 'branch-001',
        messages,
      });
    }
  }

  return {
    id: detail.id ?? '',
    title: detail.title ?? 'Untitled',
    createTime: detail.create_time ?? undefined,
    updateTime: detail.update_time ?? undefined,
    currentNode: detail.current_node ?? undefined,
    branches,
  };
}

function traceMainPath(
  mapping: Record<string, { parent?: string | null; children?: string[] }>,
  currentNode?: string | null
): string[] {
  if (!currentNode || !mapping[currentNode]) {
    // Fallback: find root and walk children[0]
    const root = Object.entries(mapping).find(([_, n]) => !n.parent);
    if (!root) return [];
    return walkChildrenFirst(mapping, root[0]);
  }

  const path: string[] = [];
  let nodeId: string | null | undefined = currentNode;
  while (nodeId && mapping[nodeId]) {
    path.unshift(nodeId);
    nodeId = mapping[nodeId].parent;
  }
  return path;
}

function walkChildrenFirst(
  mapping: Record<string, { parent?: string | null; children?: string[] }>,
  startId: string
): string[] {
  const path: string[] = [];
  let current: string | undefined = startId;
  while (current && mapping[current]) {
    path.push(current);
    const children = mapping[current].children;
    current = children && children.length > 0 ? children[0] : undefined;
  }
  return path;
}

function traceAllPaths(
  mapping: Record<string, { parent?: string | null; children?: string[] }>,
  startId: string
): string[][] {
  const allPaths: string[][] = [];

  function dfs(nodeId: string, currentPath: string[]): void {
    currentPath.push(nodeId);
    const children = mapping[nodeId]?.children ?? [];
    if (children.length === 0) {
      allPaths.push([...currentPath]);
    } else {
      for (const childId of children) {
        dfs(childId, currentPath);
      }
    }
    currentPath.pop();
  }

  dfs(startId, []);
  return allPaths;
}

function toWalkedMessage(msg: {
  id: string;
  author: { role: string; name?: string | null };
  content?: {
    content_type?: string;
    parts?: unknown[];
    text?: string;
    output_text?: string;
    input_text?: string;
  };
  create_time?: number | null;
  metadata?: Record<string, unknown>;
}): WalkedMessage {
  const text = extractText(msg.content);
  const isImage = msg.content?.content_type === 'image_asset_pointer';
  const isAudio = msg.content?.content_type === 'audio';

  return {
    id: msg.id,
    author: {
      role: msg.author.role,
      name: msg.author.name,
    },
    content: {
      contentType: msg.content?.content_type ?? 'unknown',
      text,
      parts: msg.content?.parts,
      isImage,
      isAudio,
    },
    timestamp: msg.create_time ?? undefined,
    metadata: msg.metadata,
  };
}

function extractText(content?: {
  content_type?: string;
  parts?: unknown[];
  text?: string;
  output_text?: string;
  input_text?: string;
}): string {
  if (!content) return '';

  // Direct text field
  if (content.text) return content.text;

  // Aggregated output_text (some models use this)
  if (content.output_text) return content.output_text;

  // Input_text (some tool calls use this)
  if (content.input_text) return content.input_text;

  // Multi-part content
  if (content.parts && content.parts.length > 0) {
    return content.parts
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          const obj = part as Record<string, unknown>;
          if (obj.content_type === 'text' && typeof obj.text === 'string') {
            return obj.text;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}
