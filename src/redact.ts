// Key hygiene. A stdio MCP server speaks JSON-RPC on stdout, so ALL diagnostics
// MUST go to stderr (a stray stdout write corrupts the protocol). Every log line
// is also scrubbed of any API key so a key can never leak into the host's logs,
// a transcript, or an error surfaced to the agent.

// hv_live_ keys are the only secret this process holds. Redact both the exact
// configured key (if known) and any hv_live_ token shape, belt and braces.
const KEY_TOKEN = /hv_live_[A-Za-z0-9_-]+/g

export function redact(text: string, key: string | null): string {
  let out = text
  if (key) out = out.split(key).join('hv_live_***')
  return out.replace(KEY_TOKEN, 'hv_live_***')
}

export interface Logger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

// stderr-only, redacting logger. The key is captured at construction so callers
// never have to remember to pass it.
export function makeLogger(key: string | null): Logger {
  const write = (level: string, message: string) => {
    process.stderr.write(`[hushvert-mcp] ${level}: ${redact(message, key)}\n`)
  }
  return {
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
  }
}
