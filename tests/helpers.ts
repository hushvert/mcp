// Test helpers: a Config builder with an injected fetch, response constructors,
// a capturing logger (to assert the key never leaks), and a tmp-file maker.

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../src/config'
import type { Logger } from '../src/redact'

// A FAKE key for tests only (never a real credential).
export const TEST_KEY = 'hv_live_testkey_abcdef0123456789' // gitleaks:allow

export function makeConfig(over: Partial<Config> & { fetchImpl: Config['fetchImpl'] }): Config {
  return {
    apiBase: 'https://api.test',
    apiKey: TEST_KEY,
    defaultWaitSeconds: 5,
    pollIntervalMs: 1,
    maxJobsPerSession: Number.POSITIVE_INFINITY,
    allowedDir: null,
    ...over,
  }
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export function binResponse(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status })
}

export interface CapturingLogger extends Logger {
  lines: string[]
}

export function capturingLogger(): CapturingLogger {
  const lines: string[] = []
  return {
    lines,
    info: (m) => lines.push(`info: ${m}`),
    warn: (m) => lines.push(`warn: ${m}`),
    error: (m) => lines.push(`error: ${m}`),
  }
}

export async function makeTmpFile(name: string, contents: string): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'hushvert-mcp-'))
  const path = join(dir, name)
  await writeFile(path, contents)
  return { dir, path }
}
