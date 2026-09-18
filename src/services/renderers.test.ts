import { describe, it, expect } from 'vitest';
import { MarkdownRenderer, HtmlRenderer } from './renderers';
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

function buildConversation(userContent?: string): ConversationDetail {
  return {
    id: 'test-convo',
    title: 'Test Conversation',
    create_time: 1700000000,
    update_time: 1700000001,
    current_root: 'msg2',
    moderation_results: [],
    mapping: {
      'root': {
        id: 'root',
        message: makeMessage('root', 'system', 'You are a helpful assistant', 1700000000),
        parent: null,
        children: ['msg1'],
      },
      'msg1': {
        id: 'msg1',
        message: makeMessage('msg1', 'user', userContent ?? 'Hello!', 1700000000),
        parent: 'root',
        children: ['msg2'],
      },
      'msg2': {
        id: 'msg2',
        message: makeMessage('msg2', 'assistant', 'Hi there! How can I help?', 1700000001),
        parent: 'msg1',
        children: [],
      },
    },
  } as ConversationDetail;
}

describe('MarkdownRenderer', () => {
  const renderer = new MarkdownRenderer();
  const defaultOptions = { includeSystemMessages: false, includeToolMessages: false };

  it('renders conversation as markdown', () => {
    const tree = walkConversationTree(buildConversation());
    const result = renderer.render(tree, defaultOptions);
    expect(result.content).toContain('# Test Conversation');
    expect(result.content).toContain('Hello!');
    expect(result.content).toContain('Hi there!');
  });

  it('has correct format', () => {
    expect(renderer.format).toBe('md');
  });

  it('returns correct extension', () => {
    const tree = walkConversationTree(buildConversation());
    const result = renderer.render(tree, defaultOptions);
    expect(result.extension).toBe('md');
  });
});

describe('HtmlRenderer', () => {
  const renderer = new HtmlRenderer();
  const defaultOptions = { includeSystemMessages: false, includeToolMessages: false };

  it('renders valid HTML structure', () => {
    const tree = walkConversationTree(buildConversation());
    const result = renderer.render(tree, defaultOptions);
    expect(result.content).toContain('<!DOCTYPE html>');
    expect(result.content).toContain('<html');
    expect(result.content).toContain('Test Conversation');
    expect(result.content).toContain('Hello!');
  });

  it('escapes HTML entities in content', () => {
    const tree = walkConversationTree(buildConversation('<script>alert("xss")</script>'));
    const result = renderer.render(tree, defaultOptions);
    expect(result.content).not.toContain('<script>alert');
    expect(result.content).toContain('&lt;script&gt;');
  });

  it('has correct format', () => {
    expect(renderer.format).toBe('html');
  });

  it('returns correct extension', () => {
    const tree = walkConversationTree(buildConversation());
    const result = renderer.render(tree, defaultOptions);
    expect(result.extension).toBe('html');
  });
});
