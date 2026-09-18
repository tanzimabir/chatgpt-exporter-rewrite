# Living Log — chatgpt-exporter-rewrite

## 2026-09-19 — Project start + initial build

**Goal**: Full rewrite of FdezRomero/chatgpt-exporter with better architecture, branch fidelity, multiple output formats, and operational robustness.

### Status: ✅ COMPLETE — builds and runs

### What was built:

**Source files (20 files, ~1,500 LOC)**:

| File | Purpose |
|---|---|
| `src/index.ts` | Entry with SIGINT/SIGTERM handlers |
| `src/api/endpoints.ts` | BASE_URL + ENDPOINTS constant |
| `src/api/types.ts` | Zod schemas + 5 custom error types |
| `src/api/client.ts` | fetch with AbortController timeouts, retry, optional UA rotation |
| `src/api/pagination.ts` | Async generators for conversations + projects |
| `src/services/tree-walker.ts` | DFS tree walk — returns ALL branches |
| `src/services/renderers.ts` | Pluggable renderers: md, txt, json, jsonl, html |
| `src/services/backup-service.ts` | Download orchestration + checkpoint/resume |
| `src/services/file-service.ts` | File extraction + path-safe downloads |
| `src/services/storage-service.ts` | JSON I/O + checkpoint persistence |
| `src/utils/config.ts` | YAML config loading with defaults |
| `src/utils/logger.ts` | Structured JSON-line logger |
| `src/utils/retry.ts` | Exponential backoff with jitter |
| `src/utils/sanitize.ts` | Path sanitization (strips traversal) |
| `src/utils/user-agent.ts` | UA pool + rotation |
| `src/cli/index.ts` | Commander CLI (backup/list/projects) |
| `src/cli/commands/backup.ts` | Full backup flow + dry-run |
| `src/cli/commands/list.ts` | List conversations |
| `src/cli/commands/projects.ts` | List projects |
| `src/cli/progress.ts` | cli-progress bar helper |

### Bugs fixed during build:
1. `renderers.ts:216` — CSS lines missing `parts.push()` wrapper
2. `config.ts:64` — `findConfigFile()` was sync but used `await`
3. `logger.ts:26` — `require('node:fs')` in ESM module; replaced with top-level import
4. `client.ts` — `fetchRaw` was missing retry logic; refactored to use `withRetry`

### Build output:
```
ESM dist/index.js 67.92 KB ✅
DTS dist/index.d.ts 20.00 B ✅
```

### CLI verification:
```
chatgpt-exporter --version  → 2.0.0
chatgpt-exporter backup --help  → all flags present
chatgpt-exporter list --help  → works
chatgpt-exporter projects --help  → works
```

### Key improvements over original:
1. **Branch fidelity** — DFS walker traces every root-to-leaf path
2. **5 output formats** — md, txt, json, jsonl, html (plugin architecture)
3. **Timeouts** — AbortController on every fetch (configurable)
4. **Checkpoint/resume** — periodic saves to checkpoint.json
5. **Dry-run** — preview scope without writing
6. **YAML config** — `.chatgpt-exporter.yaml` for recurring jobs
7. **Path sanitization** — strips `..` and hidden files from OpenAI metadata
8. **User-Agent rotation** — optional `--rotate-ua`
9. **Structured logging** — `--log-file` with JSON lines
10. **Better error taxonomy** — `ConversationNotFoundError`, `FileUnavailableError`

### Next (deferred — not blocking):
- Add vitest unit tests for tree-walker and renderers
- Live API test with real token (requires Tanzim's token)
- GitHub Actions CI for build+test
- Publish to npm
