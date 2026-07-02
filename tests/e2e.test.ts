// Live end-to-end test against the real API + worker. OPT-IN: skipped unless
// HUSHVERT_MCP_E2E_KEY holds a real hv_live_ key. It spends one real conversion
// against that account, so the founder runs it; CI does not. Covers the
// acceptance items the mocked suite cannot: a real file round-trips through the
// actual worker, and check_usage shows exactly one metered job.
//
//   HUSHVERT_MCP_E2E_KEY=hv_live_... pnpm --filter @hushvert/mcp test
//   (optionally HUSHVERT_MCP_E2E_BASE=https://staging... to target a non-prod API)

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HushvertClient } from '../src/api'
import type { Config } from '../src/config'
import { checkUsage, type ConvertContext, convertFile, type ToolResult } from '../src/tools'

const KEY = process.env.HUSHVERT_MCP_E2E_KEY
const BASE = process.env.HUSHVERT_MCP_E2E_BASE ?? 'https://hushvert.com'

function makeCtx(): ConvertContext {
  const config: Config = {
    apiBase: BASE.replace(/\/$/, ''),
    apiKey: KEY ?? null,
    defaultWaitSeconds: 150,
    pollIntervalMs: 2000,
    maxJobsPerSession: Number.POSITIVE_INFINITY,
    allowedDir: null,
    fetchImpl: globalThis.fetch,
  }
  return {
    client: new HushvertClient(config),
    config,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    session: { jobs: 0 },
  }
}

function payload(result: ToolResult): Record<string, unknown> {
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>
}

describe.skipIf(!KEY)('live e2e (md -> docx through the real worker)', () => {
  it(
    'converts a markdown file to docx and meters exactly one job',
    { timeout: 200_000 },
    async () => {
      const ctx = makeCtx()

      const before = payload(await checkUsage(ctx))
      const beforeRemaining = (before.freeTier as { jobsRemaining: number }).jobsRemaining
      const beforeCredits = before.creditsBalance as number

      const dir = await mkdtemp(join(tmpdir(), 'hushvert-e2e-'))
      const input = join(dir, 'note.md')
      await writeFile(input, '# Hello\n\nThis is a hushvert MCP end-to-end test.\n')
      const output = join(dir, 'note.docx')

      const result = await convertFile(ctx, { input_path: input, to: 'docx', output_path: output })
      expect(result.isError, result.content[0]?.text).toBeFalsy()
      const out = payload(result)
      expect(out.status).toBe('done')
      expect(out.pair).toBe('md-to-docx')

      // docx is a zip container: first two bytes are "PK".
      const bytes = await readFile(output)
      expect(bytes.byteLength).toBeGreaterThan(0)
      expect(bytes[0]).toBe(0x50)
      expect(bytes[1]).toBe(0x4b)

      // Exactly one job metered: either a free job was consumed, or one+ credits
      // were spent (which lane depends on the account state).
      const after = payload(await checkUsage(ctx))
      const afterRemaining = (after.freeTier as { jobsRemaining: number }).jobsRemaining
      const afterCredits = after.creditsBalance as number
      const freeConsumed = beforeRemaining - afterRemaining === 1
      const creditSpent = beforeCredits - afterCredits >= 1
      expect(freeConsumed || creditSpent).toBe(true)
    },
  )
})
