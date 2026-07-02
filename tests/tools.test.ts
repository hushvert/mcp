import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { HushvertClient } from '../src/api'
import type { Config } from '../src/config'
import { checkUsage, type ConvertContext, convertFile, convertPoll, listFormats, type ToolResult } from '../src/tools'
import { binResponse, capturingLogger, jsonResponse, makeConfig, makeTmpFile, TEST_KEY } from './helpers'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // "%PDF"

// A scripted fetch routing by URL + method. Every response is built fresh from a
// thunk on each call: a Response body is single-use, so reusing one across calls
// (or tests) would throw on the second read. Status GETs return the given thunks
// in sequence (the last repeats), so a [processing, done] script exercises the
// poll loop.
type Thunk = () => Response
function scriptedFetch(opts: {
  submit?: Thunk
  statuses?: Thunk[]
  download?: Uint8Array
  formats?: Thunk
  usage?: Thunk
}): typeof fetch {
  let statusIdx = 0
  return (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (url.endsWith('/api/v1/conversions') && method === 'POST') {
      return opts.submit
        ? opts.submit()
        : jsonResponse({ jobId: 'job1', uploadUrl: 'https://r2.test/up', pollUrl: '/api/v1/conversions/job1' }, 201)
    }
    if (url.startsWith('https://r2.test/up') && method === 'PUT') return new Response(null, { status: 200 })
    if (url.includes('/api/v1/conversions/') && method === 'GET') {
      const list = opts.statuses ?? []
      const thunk = list[Math.min(statusIdx, list.length - 1)]
      statusIdx += 1
      return thunk ? thunk() : jsonResponse({ error: 'no status', code: 'server' }, 500)
    }
    if (url.startsWith('https://r2.test/down') && method === 'GET') return binResponse(opts.download ?? PDF_BYTES)
    if (url.endsWith('/api/v1/formats') && method === 'GET') {
      return opts.formats ? opts.formats() : jsonResponse({ pairs: [] })
    }
    if (url.endsWith('/api/v1/usage') && method === 'GET') {
      return opts.usage
        ? opts.usage()
        : jsonResponse({ freeTier: { jobsPerMonth: 50, jobsRemaining: 49 }, creditsBalance: 0, currentWindow: { windowStart: 'w', key: { jobs: 1, bytes: 1 }, account: { jobs: 1, bytes: 1 } } })
    }
    return jsonResponse({ error: 'unexpected', code: 'server' }, 500)
  }) as typeof fetch
}

function makeCtx(config: Config, session = { jobs: 0 }): ConvertContext {
  return { client: new HushvertClient(config), config, logger: capturingLogger(), session }
}

function parse(result: ToolResult): Record<string, unknown> {
  const text = result.content[0]?.text ?? ''
  return JSON.parse(text) as Record<string, unknown>
}

function textOf(result: ToolResult): string {
  return result.content[0]?.text ?? ''
}

const doneStatus = (): Response =>
  jsonResponse({ jobId: 'job1', status: 'done', downloadUrl: 'https://r2.test/down/job1', error: null, expiresAt: null })
const processingStatus = (): Response =>
  jsonResponse({ jobId: 'job1', status: 'processing', downloadUrl: null, error: null, expiresAt: null })

describe('convertFile', () => {
  it('runs the full flow and writes the output (acceptance 1)', async () => {
    const { dir, path } = await makeTmpFile('sample.docx', 'hello docx contents')
    const fetchImpl = scriptedFetch({ statuses: [processingStatus, doneStatus], download: PDF_BYTES })
    const session = { jobs: 0 }
    const ctx = makeCtx(makeConfig({ fetchImpl }), session)

    const result = await convertFile(ctx, { input_path: path, to: 'pdf' })

    expect(result.isError).toBeFalsy()
    const out = parse(result)
    expect(out.pair).toBe('docx-to-pdf')
    expect(out.status).toBe('done')
    expect(out.output_path).toBe(join(dir, 'sample.pdf'))
    expect(out.bytesOut).toBe(PDF_BYTES.byteLength)
    expect(session.jobs).toBe(1)
    const written = await readFile(join(dir, 'sample.pdf'))
    expect(new Uint8Array(written)).toEqual(PDF_BYTES)
  })

  it('refuses a client pair without charging (acceptance 3)', async () => {
    const { dir, path } = await makeTmpFile('a.png', 'pngdata')
    const submit = (): Response =>
      jsonResponse({ error: 'pair "png-to-jpg" runs in the browser; use the open-source SDK', code: 'client-pair' }, 400)
    const session = { jobs: 0 }
    const ctx = makeCtx(makeConfig({ fetchImpl: scriptedFetch({ submit }) }), session)

    const result = await convertFile(ctx, { input_path: path, to: 'jpg' })

    expect(result.isError).toBeFalsy()
    const out = parse(result)
    expect(out.refused).toBe(true)
    expect(String(out.suggestion)).toMatch(/@hushvert\/engine/)
    expect(session.jobs).toBe(0)
    await expect(readFile(join(dir, 'a.jpg'))).rejects.toBeTruthy()
  })

  it('surfaces an unknown pair as a clean error (acceptance 4)', async () => {
    const { path } = await makeTmpFile('weird.xyz', 'data')
    const submit = (): Response => jsonResponse({ error: 'unknown pair "xyz-to-zzz"', code: 'unknown-pair' }, 400)
    const ctx = makeCtx(makeConfig({ fetchImpl: scriptedFetch({ submit }) }))

    const result = await convertFile(ctx, { input_path: path, to: 'zzz' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/list_formats/)
  })

  it('fires the session circuit breaker before any API call (acceptance 10)', async () => {
    const { path } = await makeTmpFile('sample.docx', 'data')
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const ctx = makeCtx(makeConfig({ fetchImpl, maxJobsPerSession: 2 }), { jobs: 2 })

    const result = await convertFile(ctx, { input_path: path, to: 'pdf' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/Session conversion limit reached/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('degrades to async when the job is still running at the deadline (acceptance 7)', async () => {
    const { path } = await makeTmpFile('clip.mov', 'video')
    const fetchImpl = scriptedFetch({ statuses: [processingStatus] })
    const session = { jobs: 0 }
    const ctx = makeCtx(makeConfig({ fetchImpl, defaultWaitSeconds: 0 }), session)

    const result = await convertFile(ctx, { input_path: path, to: 'mp4' })

    expect(result.isError).toBeFalsy()
    const out = parse(result)
    expect(out.status).toBe('processing')
    expect(out.resumeWith).toBe('convert_poll')
    expect(session.jobs).toBe(1)
  })

  it('refuses to silently overwrite the default output (safety)', async () => {
    const { dir, path } = await makeTmpFile('sample.docx', 'data')
    await writeFile(join(dir, 'sample.pdf'), 'pre-existing')
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const ctx = makeCtx(makeConfig({ fetchImpl }))

    const result = await convertFile(ctx, { input_path: path, to: 'pdf' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/already exists/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never leaks the key on a generic failure (acceptance 6)', async () => {
    const { path } = await makeTmpFile('sample.docx', 'data')
    const fetchImpl = (async () => {
      throw new Error(`network exploded for ${TEST_KEY}`)
    }) as typeof fetch
    const ctx = makeCtx(makeConfig({ fetchImpl }))

    const result = await convertFile(ctx, { input_path: path, to: 'pdf' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toContain(TEST_KEY)
    expect(textOf(result)).toContain('hv_live_***')
  })
})

describe('convertPoll', () => {
  it('completes a job and writes the result', async () => {
    const { dir } = await makeTmpFile('placeholder.txt', 'x')
    const fetchImpl = scriptedFetch({ statuses: [doneStatus], download: PDF_BYTES })
    const ctx = makeCtx(makeConfig({ fetchImpl }))
    const outPath = join(dir, 'late.pdf')

    const result = await convertPoll(ctx, { jobId: 'job1', output_path: outPath })

    const out = parse(result)
    expect(out.status).toBe('done')
    expect(out.output_path).toBe(outPath)
    const written = await readFile(outPath)
    expect(new Uint8Array(written)).toEqual(PDF_BYTES)
  })
})

describe('listFormats', () => {
  it('returns server pairs and filters by source (acceptance 8)', async () => {
    const formats = (): Response =>
      jsonResponse({
        pairs: [
          { from: 'docx', to: 'pdf', pair: 'docx-to-pdf', label: 'DOCX to PDF', freeMaxMB: 50, costCredits: 1 },
          { from: 'mov', to: 'mp4', pair: 'mov-to-mp4', label: 'MOV to MP4', freeMaxMB: 500, costCredits: 1 },
        ],
      })
    const ctx = makeCtx(makeConfig({ fetchImpl: scriptedFetch({ formats }) }))

    const all = parse(await listFormats(ctx, {}))
    expect((all.pairs as unknown[]).length).toBe(2)

    const onlyDocx = parse(await listFormats(ctx, { from: 'docx' }))
    expect((onlyDocx.pairs as { from: string }[]).every((p) => p.from === 'docx')).toBe(true)
  })
})

describe('checkUsage', () => {
  it('reports the free tier and credit balance', async () => {
    const ctx = makeCtx(makeConfig({ fetchImpl: scriptedFetch({}) }))
    const out = parse(await checkUsage(ctx))
    expect((out.freeTier as { jobsRemaining: number }).jobsRemaining).toBe(49)
    expect(out.creditsBalance).toBe(0)
  })
})
