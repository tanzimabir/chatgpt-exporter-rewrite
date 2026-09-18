# ChatGPT Exporter Rewrite — Architecture

## Design goals

1. **Branch fidelity** — every branch exported, not just children[0]
2. **Pluggable formats** — Markdown, HTML, plain text, JSON, JSONL
3. **Operational robustness** — timeouts, resume, dry-run, structured logging
4. **Config file** — YAML for recurring jobs
5. **Privacy** — local-only, no telemetry, token never persisted

## Module layout

```
src/
├── index.ts              # entry, signal handlers
├── api/
│   ├── client.ts         # fetch with AbortController, retry, UA rotation
│   ├── endpoints.ts      # BASE_URL, ENDPOINTS constant
│   ├── pagination.ts     # async generators for conversations/projects
│   └── types.ts          # Zod schemas + error classes
├── services/
│   ├── backup-service.ts # download orchestration, checkpoint/resume
│   ├── file-service.ts   # file reference extraction + download
│   ├── renderers.ts      # pluggable format renderers
│   ├── storage-service.ts# JSON file I/O, checkpoint persistence
│   └── tree-walker.ts    # walks mapping tree, returns ALL branches
├── cli/
│   ├── index.ts          # commander CLI definition
│   ├── progress.ts       # cli-progress bar helper
│   └── commands/
│       ├── backup.ts     # backup flow (main + projects + files + render)
│       ├── list.ts       # list conversations
│       └── projects.ts   # list projects
└── utils/
    ├── config.ts         # YAML config loading + defaults
    ├── logger.ts         # structured JSON-line logger
    ├── retry.ts          # exponential backoff with jitter
    ├── sanitize.ts       # path sanitization
    └── user-agent.ts     # UA rotation pool
```

## Key decisions

- **Tree walker vs. linear**: Original used a linear thread walker. New code uses a recursive DFS that traces every root-to-leaf path, producing one branch per unique path.
- **Per-branch files**: When a conversation has multiple branches, each is written to `<id>__branch-001.md`, `<id>__branch-002.md`, etc.
- **Checkpoints**: Periodic saves to `checkpoint.json` map conversationId → {updateTime, downloadedAt}. On resume with `--incremental`, already-downloaded conversations are skipped.
- **File path safety**: OpenAI's `file_name` field is sanitized via `sanitizeRelativePath()` which strips traversal (`..`) and hidden files.
- **Timeouts**: `AbortController` with configurable timeout (default 30s API, 120s downloads). Timed-out requests throw `NetworkError` with status 408.
