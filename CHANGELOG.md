# Changelog

## 0.1.3

- Fix: the server reported version `0.1.0` in the MCP handshake, and had done so
  through the 0.1.1 and 0.1.2 releases. It now reports the real version, and a
  test fails if it ever drifts from package.json again.
- `convert_file` description: say what an agent needs in order to choose well.
  This renders a document as authored; local pandoc rebuilds docx through LaTeX
  and re-typesets it, which looks like a successful conversion and is not one.
  It also states that the uploaded file is deleted when the job finishes, and
  that a local LibreOffice is an equivalent choice that keeps the file on the
  machine. No behavior change.

## 0.1.2

- README: the Claude Code install now leads with the `claude mcp add` one-liner
  (no file to edit); the JSON block stays as the config for Cursor, Cline, Zed,
  and other MCP hosts.
- README: added a recording of a real Claude Code session using `convert_file`,
  and a section on why to use this rather than let the agent shell out to a local
  converter (pandoc rebuilds a Word document through LaTeX instead of converting
  it, so the output is a different document), with a side-by-side of both outputs
  from one source file.
- README: do not put an API key in a committed MCP config. Claude Code expands
  `${HUSHVERT_API_KEY}`, so the key can stay in the shell.
- No code changes.

## 0.1.1

- README: point "get an API key" at hushvert.com/developers/keys (the page with
  the key CTA) instead of /account. No code changes.

## 0.1.0

Initial release. A stdio Model Context Protocol server over the hushvert hosted
API.

- `convert_file`: convert a local file to a server-only format (office to PDF,
  PDF to Word, document interchange, video) in one tool call - read, convert,
  write.
- `convert_poll`: finish a long-running conversion (large video) by job id.
- `list_formats`: enumerate the supported server pairs from the live formats
  endpoint.
- `check_usage`: report free allowance remaining, credit balance, and the current
  billing window.
- Client pairs are refused with a pointer to the free `@hushvert/engine` package.
- Key hygiene: the API key is never logged or surfaced; diagnostics are
  stderr-only and redacted. Optional `HUSHVERT_ALLOWED_DIR` sandbox and
  `HUSHVERT_MAX_JOBS_PER_SESSION` circuit breaker.
