import { describe, it, expect } from 'vitest';
import { walkConversationTree } from './tree-walker';
import type { ConversationDetail } from '../api/types';

function makeMessage(id: string, role: string, content: string, create_time?: number) {
  return {
    id,
    author: { role },
    content: { content_type: 'text', parts: [content] },
    create_time: create_time ?? Date.now() / 1000,
  };
}

function buildConversation(mapping: Record<string, { id: string; children: string[] }>): ConversationDetail {
  // Build parent map from children
  const parentMap: Record<string, string> = {};
  for (const [key, node] of Object.entries(mapping)) {
    for (const childId of node.children) {
      parentMap[childId] = key;
    }
  }

  const convo: any = {
    id: 'test-convo',
    title: 'Test',
    create_time: Date.now() / 1000,
    update_time: Date.now() / 1000,
    mapping: {},
    moderation_results: [],
    current_root: '',
  };

  for (const [key, node] of Object.entries(mapping)) {
    convo.mapping[key] = {
      id: node.id,
      message: makeMessage(key, key === 'root' ? 'system' : 'user', `content-${key}`),
      parent: parentMap[key] ?? null,
      children: node.children,
    };
  }
  convo.current_root = Object.keys(mapping).find(k => !parentMap[k]) ?? Object.keys(mapping)[0];

  return convo as ConversationDetail;
}

describe('walkConversationTree', () => {
  it('returns single path for linear conversation', () => {
    const convo = buildConversation({
      'root': { id: 'root', children: ['a'] },
      'a': { id: 'a', children: ['b'] },
      'b': { id: 'b', children: [] },
    });

    const tree = walkConversationTree(convo);
    expect(tree.branches).toHaveLength(1);
    expect(tree.branches[0].messages.map(m => m.id)).toEqual(['root', 'a', 'b']);
  });

  it('returns two branches for single fork', () => {
    const convo = buildConversation({
      'root': { id: 'root', children: ['a', 'b'] },
      'a': { id: 'a', children: [] },
      'b': { id: 'b', children: [] },
    });

    const tree = walkConversationTree(convo);
    expect(tree.branches).toHaveLength(2);
    expect(tree.branches[0].messages.map(m => m.id)).toEqual(['root', 'a']);
    expect(tree.branches[1].messages.map(m => m.id)).toEqual(['root', 'b']);
  });

  it('returns three branches for nested fork', () => {
    const convo = buildConversation({
      'root': { id: 'root', children: ['a', 'b'] },
      'a': { id: 'a', children: ['c', 'd'] },
      'b': { id: 'b', children: [] },
      'c': { id: 'c', children: [] },
      'd': { id: 'd', children: [] },
    });

    const tree = walkConversationTree(convo);
    expect(tree.branches).toHaveLength(3);
  });

  it('skips branches with missing messages', () => {
    const convo = buildConversation({
      'root': { id: 'root', children: ['missing', 'b'] },
      'b': { id: 'b', children: [] },
    });

    const tree = walkConversationTree(convo);
    expect(tree.branches).toHaveLength(1);
    expect(tree.branches[0].messages.map(m => m.id)).toEqual(['root', 'b']);
  });

  it('uses main branch when includeAllBranches is false', () => {
    const convo = buildConversation({
      'root': { id: 'root', children: ['a', 'b'] },
      'a': { id: 'a', children: [] },
      'b': { id: 'b', children: [] },
    });
    const tree = walkConversationTree(convo, false);
    expect(tree.branches).toHaveLength(1);
  });
});
