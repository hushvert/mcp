<p align="center"><img src="assets/logo.png" width="84" alt="hushvert" /></p>

# @hushvert/mcp

[![npm](https://img.shields.io/npm/v/@hushvert/mcp.svg)](https://www.npmjs.com/package/@hushvert/mcp)
[![license](https://img.shields.io/npm/l/@hushvert/mcp.svg)](./LICENSE)

**A file-conversion tool for your AI agent.**

`@hushvert/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server that gives an AI coding agent (Claude Code, Cursor, Cline, Zed, and any
other MCP host) a `convert_file` tool over the hushvert hosted API. When a task
needs a conversion a browser cannot do - office documents to PDF, PDF to Word,
large video transcodes - the agent converts the file in one tool call, and the
result is written next to the input. No upload code, no polling, no glue.

It is a thin client over the [hushvert](https://hushvert.com) hosted API. For the
conversions that DO run in a browser (images, HEIC, archives, audio, small video,
PDF page ops), use the free, open-source [`@hushvert/engine`](https://www.npmjs.com/package/@hushvert/engine)
package instead - this server will refuse those and point you there.

## Install

Get an API key from your [hushvert account](https://hushvert.com/account)
(developer section - a confirmed email is required), then add the server to your
agent's MCP config.

**Claude Code** (`.mcp.json` in your project, or the user config):

```json
{
  "mcpServers": {
    "hushvert": {
      "command": "npx",
      "args": ["-y", "@hushvert/mcp"],
      "env": { "HUSHVERT_API_KEY": "hv_live_your_key_here" }
    }
  }
}
```

The same `command` / `args` / `env` block works for Cursor, Cline, Zed, and other
MCP hosts. Then ask your agent: "convert report.docx to PDF."

## Tools

| Tool | What it does |
| --- | --- |
| `convert_file` | Convert a local file to another format. Reads the input, runs the conversion, writes the output, returns the path. |
| `convert_poll` | Finish a long conversion (large video) that was still running when `convert_file` returned. |
| `list_formats` | List the conversions the hosted API supports (the server-only pairs). |
| `check_usage` | Show free conversions remaining, credit balance, and the current billing window. |

### `convert_file`

```
input_path       (required) path to the source file
to               (required) target format, e.g. "pdf", "docx", "mp4"
from             (optional) source format; inferred from the extension otherwise
output_path      (optional) where to write; defaults beside the input. Required to overwrite.
wait_seconds     (optional) max seconds to wait before handing back a jobId to poll. Default 120.
idempotency_key  (optional) makes a retried conversion safe (same job, charged once)
```

Returns `{ output_path, jobId, pair, bytesIn, bytesOut, status }`. If the job is
still running after `wait_seconds` (typical for large video), it returns
`{ jobId, status: "processing", resumeWith: "convert_poll" }`; call `convert_poll`
with the `jobId` and an `output_path` to finish.

## What it converts

The server-only formats a browser cannot do:

- **Office to PDF**: docx, pptx, xlsx, doc, ppt, xls, odt, ods, odp, rtf, html to pdf
- **PDF to Word**: pdf to docx
- **Document interchange**: md, html, epub, latex, rst, docx (via pandoc)
- **Video**: mov, mkv, avi, webm to mp4 (and mp4 to gif)

Call `list_formats` for the live list. Everything else (images, HEIC, archives,
audio, small video, PDF page ops) runs free, client-side, in
[`@hushvert/engine`](https://www.npmjs.com/package/@hushvert/engine).

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `HUSHVERT_API_KEY` | (required) | Your `hv_live_` developer key. |
| `HUSHVERT_API_BASE` | `https://hushvert.com` | API base URL (for self-host / staging). |
| `HUSHVERT_DEFAULT_WAIT_SECONDS` | `120` | Default poll budget for `convert_file`. |
| `HUSHVERT_MAX_JOBS_PER_SESSION` | unlimited | Client-side cap on conversions per server run (a guard against runaway loops). |
| `HUSHVERT_ALLOWED_DIR` | unset | If set, the server only reads/writes files under this directory. |

## Billing and privacy

Conversions are billed per use against your account: a free monthly allowance,
then credits. `check_usage` shows your remaining allowance and balance at any
time - have your agent check it before a large batch. The hosted API processes
the server-only formats that genuinely cannot run in a browser; for everything
else the file never leaves the device via the open-source engine. See
[hushvert.com/for-developers](https://hushvert.com/for-developers).

## Security

The API key is read from the environment, never logged, and never returned in a
tool result or error. See [SECURITY.md](./SECURITY.md).

## License

MIT
