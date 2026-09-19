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

Two methods are supported. Use whichever works for you:

### Method 1: Bearer token (OAuth)

```bash
chatgpt-exporter backup --token $CHATGPT_TOKEN
```

Or set `CHATGPT_TOKEN` env var.

**To get the token:** Open https://chatgpt.com → DevTools → Network → `/backend-api/*` → copy `Authorization: Bearer ***` header value.

⚠️ OAuth tokens expire and may be revoked if used from CLI outside the browser context.

### Method 2: Browser cookies (recommended)

```bash
chatgpt-exporter backup --cookies "key1=val1; key2=val2"
```

Or set `CHATGPT_COOKIES` env var.

**To get the cookies:**

1. Open https://chatgpt.com in your browser
2. Open DevTools → Application → Cookies
3. Copy all cookie names and values as `name1=value1; name2=value2`

Or use a browser extension like "EditThisCookie" or "Cookie-Editor" → Export as string.

The tool sends cookies with every request to `chatgpt.com/backend-api/*`. No token required.

### YAML config

```yaml
# .chatgpt-exporter.yaml
cookies: "__Secure-next-auth.session-token=abc123; oai-sc=xyz..."
output: ./my-export
format: [md, json]
```

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
