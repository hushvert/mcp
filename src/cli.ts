// Entry point for the `hushvert-mcp` binary. A stdio MCP server: JSON-RPC on
// stdout, diagnostics on stderr only. The shebang is added by the build banner
// (build.mjs), so it is intentionally absent here.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config'
import { makeLogger } from './redact'
import { createServer } from './server'

async function main(): Promise<void> {
  const config = loadConfig()
  const logger = makeLogger(config.apiKey)
  if (!config.apiKey) {
    logger.warn(
      'HUSHVERT_API_KEY is not set. The conversion tools will return an auth error until it is set in the server env.',
    )
  }

  const server = createServer(config)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info(`hushvert MCP server ready (API ${config.apiBase})`)
}

main().catch((err: unknown) => {
  // Never throw past here: a clean stderr line, no key, non-zero exit.
  process.stderr.write(`[hushvert-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
