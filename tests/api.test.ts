import { describe, expect, it, vi } from 'vitest'
import { HushvertClient } from '../src/api'
import { HushvertApiError } from '../src/errors'
import { jsonResponse, makeConfig, TEST_KEY } from './helpers'

describe('HushvertClient', () => {
  it('submits with the bearer key and idempotency header, parses the result', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return jsonResponse({ jobId: 'job1', uploadUrl: 'https://r2/up', pollUrl: '/api/v1/conversions/job1' }, 201)
    }) as unknown as typeof fetch

    const client = new HushvertClient(makeConfig({ fetchImpl }))
    const res = await client.submit({ pair: 'docx-to-pdf', bytes: 100, idempotencyKey: 'idem-1' })

    expect(res.jobId).toBe('job1')
    expect(calls[0]?.url).toBe('https://api.test/api/v1/conversions')
    const headers = calls[0]?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe(`Bearer ${TEST_KEY}`)
    expect(headers['idempotency-key']).toBe('idem-1')
  })

  it('turns a typed error envelope into a HushvertApiError with code + retry-after', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'slow down', code: 'rate-limited' }, 429, { 'retry-after': '12' })) as typeof fetch
    const client = new HushvertClient(makeConfig({ fetchImpl }))

    await expect(client.usage()).rejects.toMatchObject({
      name: 'HushvertApiError',
      code: 'rate-limited',
      status: 429,
      retryAfter: '12',
    })
  })

  it('short-circuits to unauthenticated when no key is configured (no fetch call)', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const client = new HushvertClient(makeConfig({ fetchImpl, apiKey: null }))

    await expect(client.submit({ pair: 'docx-to-pdf', bytes: 10 })).rejects.toBeInstanceOf(HushvertApiError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reads formats without requiring a key', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ pairs: [{ from: 'docx', to: 'pdf', pair: 'docx-to-pdf', label: 'DOCX to PDF', freeMaxMB: 50, costCredits: 1 }] })) as typeof fetch
    const client = new HushvertClient(makeConfig({ fetchImpl, apiKey: null }))

    const { pairs } = await client.formats()
    expect(pairs[0]?.pair).toBe('docx-to-pdf')
  })
})
