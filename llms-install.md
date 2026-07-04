# hushvert MCP server: installation guide for AI agents

This file is written for an AI assistant (for example Cline) that is installing the
hushvert MCP server on a user's behalf. Follow these steps.

## Prerequisites

- Node.js >= 18 on the user's machine (the server runs via `npx`).
- A hushvert API key. If the user does not have one, ask them to create a key at
  https://hushvert.com/developers/keys (sign-in is a one-time email code; the free
  monthly allowance needs no payment). The key looks like `hv_live_...`.

## Install

Add this server to the user's Cline MCP settings file (`cline_mcp_settings.json`):

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

Replace `hv_live_your_key_here` with the user's real key. No build or global install is
needed; `npx` fetches the package on first run. The same block works for Claude Code,
Cursor, Zed, and other MCP hosts.

## Verify

Ask the server to run `check_usage`. It returns the free conversions remaining and the
credit balance without performing (or billing) a conversion, so it is a safe connectivity
check. `list_formats` is another safe, read-only call that lists the supported pairs.

## Notes

- The API key is read from the environment only. Never hardcode it into a shared or
  committed file.
- Optional environment variables:
  - `HUSHVERT_ALLOWED_DIR`: restrict all file reads/writes to a single directory.
  - `HUSHVERT_API_BASE`: point at a self-hosted or staging API (defaults to
    `https://hushvert.com`).
  - `HUSHVERT_MAX_JOBS_PER_SESSION`: cap conversions per server run (guard against loops).
- The server handles only the conversions a browser cannot do (office to PDF, PDF to
  Word, document interchange, video). It refuses browser-doable pairs (images, HEIC,
  archives, audio, small video, PDF page ops) and points to the free, open-source
  `@hushvert/engine` package instead, so those are never billed.
