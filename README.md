# ChatGPT Exporter (Rewrite)

A privacy-respecting CLI to back up and export your ChatGPT conversations — with branch fidelity, multiple formats, and resumable jobs.

> Fork/rebuild of the original [FdezRomero/chatgpt-exporter](https://github.com/FdezRomero/chatgpt-exporter) with architectural and data-fidelity improvements.

## Why a rewrite?

The original tool works but has known gaps in data fidelity (branches lost, tool results dropped), operational robustness (no timeouts, no resume, no dry-run), and extensibility (Markdown-only output). This rewrite addresses all of those.

### What's better

| Area | Before | After |
|---|---|---|
| **Branch fidelity** | `children[0]` only — all edit branches silently dropped | Full tree walker; every branch exported with divergence markers |
| **Tool / system messages** | Silently skipped | Exportable as collapsible `<details>` blocks |
| **Content types** | `parts[]` and `text` only | Also handles `output_text`, `input_text`, `audio`, `image_url` |
| **Output formats** | Markdown only | Plugin renderers: `md`, `json`, `jsonl`, `txt`, `html` |
| **Timeouts** | None — hung fetch stalls forever | `AbortController` per-request (configurable) |
| **Dry-run** | Not available | `--dry-run` shows scope without writing |
| **Resumability** | Process kill = restart from scratch | Per-conversation checkpoint; `--resume` picks up where you left off |
| **Incremental** | New projects missed on incremental runs | Always refreshes project list first |
| **Configuration** | All flags on CLI | YAML config (`.chatgpt-exporter.yaml`) for recurring jobs |
| **User-Agent** | Hardcoded Chrome 131 macOS | Configurable; rotates if `--rotate-ua` is set |
| **Error taxonomy** | `NetworkError` lumps everything | Distinct `ConversationNotFoundError`, `FileUnavailableError` |
| **Logging** | `--verbose` to stdout | `--log-file` with structured JSON lines |
| **Path traversal** | OpenAI `file_name` used directly | Sanitized with `path.basename` fallback |
| **Deduplication** | Same convo in Main + Project downloaded twice | Global dedup by ID |

## Prerequisites

- **Node.js 20+**
- A ChatGPT access token (see below)

## Quick start

```bash
# Install globally
npm install -g chatgpt-exporter

# Or run via npx
npx chatgpt-exporter backup --token "eyJhbG..."

# Or with a config file
npx chatgpt-exporter backup
```

## Getting your ChatGPT access token

1. Open [chatgpt.com](https://chatgpt.com) and log in
2. Visit [chatgpt.com/api/auth/session](https://chatgpt.com/api/auth/session) in the same browser
3. Copy the `accessToken` value (starts with `eyJhbG...`)

Pass via `--token` or set `CHATGPT_TOKEN` env var. Tokens expire — re-fetch when you see auth errors.

## Configuration

Create `.chatgpt-exporter.yaml` in your project root or home dir:

```yaml
# .chatgpt-exporter.yaml
token: "eyJhbG..."                  # or use CHATGPT_TOKEN env
output: "./chatgpt-export"
format: "md"                        # md | json | jsonl | txt | html
concurrency: 3
delay: 500                          # ms between requests
timeout:
  api: 30000                        # ms for API calls
  download: 120000                  # ms for file downloads

backup:
  incremental: true
  downloadFiles: true
  includeProjects: true
  excludeProjects:                  # exclude by name
    - "Archive"
    - "Old Project"

  # Message handling
  includeSystemMessages: false     # export system messages
  includeToolMessages: false        # export tool results as <details>
  includeAllBranches: true          # export every branch (not just main path)

logging:
  logFile: "./backup.log"           # structured JSON lines
  verbose: false

advanced:
  rotateUserAgent: false            # rotate UA per request
  dryRun: false                     # preview without writing
  resume: true                      # enable checkpoint/resume
```

## CLI usage

```bash
# Full backup (with config file)
chatgpt-exporter backup

# Override config with flags
chatgpt-exporter backup --token "eyJhbG..." --format html --dry-run

# Backup a single project
chatgpt-exporter backup --project "Research"

# Resume an interrupted backup
chatgpt-exporter backup --resume

# List conversations without downloading
chatgpt-exporter list
chatgpt-exporter list --json --project "Research"

# List projects
chatgpt-exporter projects
chatgpt-exporter projects --json

# Export to multiple formats
chatgpt-exporter backup --format md --format json

# Show what would happen
chatgpt-exporter backup --dry-run --verbose
```

### Flags

| Flag | Description | Default |
|---|---|---|
| `-t, --token <token>` | Access token | — |
| `-o, --output <dir>` | Output directory | `./chatgpt-export` |
| `-f, --format <fmt>` | Output format(s): md, json, jsonl, txt, html | `md` |
| `--incremental` | Only new/updated conversations | `false` |
| `--download-files` | Download file attachments and images | `false` |
| `--project <name>` | Only backup a specific project | all |
| `--concurrency <n>` | Parallel downloads | `3` |
| `--delay <ms>` | Delay between API requests | `500` |
| `--timeout-api <ms>` | Timeout for API calls | `30000` |
| `--timeout-download <ms>` | Timeout for file downloads | `120000` |
| `--dry-run` | Preview without writing | `false` |
| `--resume` | Resume from last checkpoint | `true` |
| `--force` | Overwrite existing output directory | `false` |
| `--include-system` | Export system messages | `false` |
| `--include-tools` | Export tool results as `<details>` | `false` |
| `--all-branches` | Export every conversation branch | `true` |
| `--rotate-ua` | Rotate User-Agent per request | `false` |
| `--log-file <path>` | Structured log file path | — |
| `-v, --verbose` | Detailed output | `false` |
| `--json` | JSON output (for list/projects) | `false` |

## Output structure

```
chatgpt-export/
  config.json                  # backup configuration snapshot
  index.json                   # global index of all conversations
  metadata.json                # backup run metadata
  checkpoint.json              # resume state
  backup.log                   # structured log
  conversations/
    index.json
    <conversation-id>.json
    <conversation-id>.md       # (or .html, .txt, .jsonl)
    ...
  projects/
    <Project_Name>/
      conversations/
        index.json
        <conversation-id>.json
        <conversation-id>.md
        ...
  files/
    <fileId>/
      <filename>               # original filename
```

## Branch format

When a conversation has multiple branches (user edited a message and continued differently), each branch is exported as a separate file with a branch marker:

```
<conversation-id>__branch-001.md    # main branch
<conversation-id>__branch-002.md    # alternative branch
<conversation-id>__branch-003.md    # another alternative
```

Inside each branch file, divergence points are marked:

```markdown
# Research Notes
*2024-01-15*

**User:**
What are the implications of quantum tunneling?

**Assistant:**
Quantum tunneling has several implications...

> _Branch point: user edited the message above_

**User:**
Tell me more about the scanning tunneling microscope.

**Assistant:**
The scanning tunneling microscope (STM)...
```

## Privacy & Security

- Runs entirely on your machine
- Only communicates with `https://chatgpt.com` (verified via `BASE_URL` constant)
- No telemetry, analytics, or third-party services
- Token used only as `Bearer` — never written to disk, never logged
- File names from OpenAI's signed metadata are sanitized before use as paths

## Development

```bash
git clone https://github.com/tanzim/chatgpt-exporter-rewrite
cd chatgpt-exporter-rewrite
npm install
npm run build
npm run dev -- backup --token "eyJhbG..."
```

## License

MIT — see [LICENSE](LICENSE)
