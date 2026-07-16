<p align="center"><img src="https://raw.githubusercontent.com/hushvert/mcp/main/assets/logo.png" width="84" alt="hushvert" /></p>

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

## Demo

A real run in Claude Code, recorded live and not sped up: ask, and `report.pdf` is
written next to the input. The whole turn took 23 seconds, of which the conversion
itself was about 7.

![Claude Code converting report.docx to PDF with the hushvert MCP server](https://raw.githubusercontent.com/hushvert/mcp/main/assets/demo.gif)

The recording starts Claude Code with only this server loaded
(`--strict-mcp-config`) so nothing unrelated is on screen. The tape that produced
it is [`assets/demo.tape`](https://github.com/hushvert/mcp/blob/main/assets/demo.tape),
if you want to reproduce it.

## Claude Code can already convert files. Why this?

Because it can only convert what your machine can convert, and when it cannot, it
does not fail loudly.

Ask any coding agent to turn `report.docx` into a PDF. If LibreOffice is
installed, it will shell out to `soffice`, do a good job, and you do not need this
server. If LibreOffice is not installed, and it is not there by default on macOS,
on Windows, or in a typical CI image, the usual fallback is pandoc. Pandoc does
not really convert a Word document. It reads the text into its own AST, hands that
to LaTeX, and LaTeX typesets a new document. You get a PDF. The agent reports
success. Nobody opens the file.

Here is the same `report.docx` down both paths:

![The same Word document converted by pandoc and by hushvert, side by side](https://raw.githubusercontent.com/hushvert/mcp/main/assets/fidelity.png)

Same words, different document. Every font in the pandoc PDF is Latin Modern,
LaTeX's default. The heading color is gone, the table lost its Word styling, and
the title moved into a centered LaTeX title block. `pdffonts` on the two outputs:

```
pandoc     LMRoman17-Regular, LMRoman12-Bold, LMRoman10-Italic, ...
hushvert   Carlito-Regular, Carlito-Bold, Carlito-Italic
```

Carlito is metric-compatible with Calibri, which is what the document actually
asked for. Latin Modern is not.

So, honestly:

- **If LibreOffice is installed and your agent reaches for it, you do not need
  this server.** That is a real answer, and it is the right one for a lot of people.
- If it is not installed, this is one line of config instead of a 281 MB download,
  and it behaves the same on your laptop, in CI, in a container, and on a machine
  you are not allowed to install software on.
- Name the tool if it matters. On a machine that had both this server and pandoc
  available, we asked the plain way ("convert report.docx to PDF") twice: Claude
  Code used `convert_file` once and pandoc the other time, and the two runs
  produced the two documents above. Which tool an agent reaches for is its call,
  not ours. "Convert report.docx to PDF with hushvert" pins it.

## Install

Get an API key at [hushvert.com/developers/keys](https://hushvert.com/developers/keys)
(sign-in is a one-time email code; keys require a confirmed email), then add the
server to your agent's MCP config.

**Claude Code** - one line, no file to edit:

```bash
claude mcp add hushvert -e HUSHVERT_API_KEY=hv_live_your_key_here -- npx -y @hushvert/mcp
```

**Cursor, Cline, Zed, and other MCP hosts** (or Claude Code, if you prefer a
committed project config) - add this block to the host's MCP config
(`.mcp.json`, `.cursor/mcp.json`, and so on):

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

If that file is committed, do not put the key in it. Claude Code expands
environment variables in an MCP config, so use `"HUSHVERT_API_KEY":
"${HUSHVERT_API_KEY}"` and keep the real key in your shell. Other hosts vary;
check yours before committing.

Then ask your agent: "convert report.docx to PDF with hushvert." Naming the server
is worth the two extra words: if your machine has a local converter, the agent may
reach for that instead, and for office documents the result is usually worse. See
[above](#claude-code-can-already-convert-files-why-this).

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
