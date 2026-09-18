# chatgpt-exporter-rewrite

> Full architectural rewrite of [FdezRomero/chatgpt-exporter](https://github.com/FdezRomero/chatgpt-exporter) — branch fidelity, multiple formats, checkpoint/resume.

## Why a rewrite?

The original is clean but immature (2 commits, 0 releases, no tests) and drops every branch except `children[0]`. For serious backup, you need **every branch**, **every message type**, and **resumable downloads**.

## Install

```bash
npm install -g chatgpt-exporter-rewrite
```

Or use npx:

```bash
npx chatgpt-exporter-rewrite backup --token $CHATGPT_TOKEN
```

## Quick start

```bash
# Full backup (Markdown)
chatgpt-exporter backup --token $CHATGPT_TOKEN -o ./my-export

# Multiple formats
chatgpt-exporter backup -t $CHATGPT_TOKEN -f md json html

# Dry-run (preview without writing)
chatgpt-exporter backup -t $CHATGPT_TOKEN --dry-run

# With file attachments
chatgpt-exporter backup -t $CHATGPT_TOKEN --download-files

# List conversations without downloading
chatgpt-exporter list -t $CHATGPT_TOKEN

# List projects
chatgpt-exporter projects -t $CHATGPT_TOKEN
```

## Authentication

Pass `--token` once, or set `CHATGPT_TOKEN` in your environment. To get your token:

1. Open https://chatgpt.com in your browser
2. Open DevTools → Application → Cookies
3. Copy the value of `__Secure-next-auth.session-token`

Tokens expire — refresh periodically.

## What's different from the original

| Feature | Original | This rewrite |
|---|---|---|
| Branches | `children[0]` only | **All branches** via DFS walker |
| Formats | Markdown | **md, txt, json, jsonl, html** |
| File downloads | Raw filename | **Sanitized** (path traversal protection) |
| Retries | None | **Exponential backoff + jitter** |
| Resume | None | **Checkpoint/resume** |
| Timeouts | None | **AbortController** (configurable) |
| Config | CLI only | **YAML config** + CLI |
| System/tool messages | Erased | **Preserved** (comments / `<details>`) |
| User-Agent | Hardcoded | **Rotation pool** (optional `--rotate-ua`) |
| Logging | Console | **Structured JSON-line** file |
| Testing | None | **21 vitest tests** |
| CI | None | **GitHub Actions** (Node 20, 22) |

## Project structure

```
src/
├── api/           HTTP client, pagination, types, endpoints
├── services/      tree-walker, renderers, backup, file, storage
├── cli/           commander: backup / list / projects
└── utils/         config, logger, retry, sanitize, user-agent
```

## Architecture docs

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for full design details.

## Development

```bash
npm install
npm run dev -- backup --token $TOKEN --dry-run
npm run build
npm test
npm run test:watch
```

## License

MIT — see [LICENSE](LICENSE). Based on FdezRomero/chatgpt-exporter (MIT).
