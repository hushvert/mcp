// The hosted-API client: a thin wrapper over the existing /api/v1 surface. It
// adds nothing to the protocol - it authenticates with the bearer key, issues
// the four-step flow (submit -> presigned PUT -> poll -> presigned GET), and
// turns a typed { error, code } response into a HushvertApiError. All billing,
// metering, rate limiting and validation live server-side; this client only
// orchestrates the dance the API already defines.

import type { Config } from './config'
import { HushvertApiError } from './errors'

export interface SubmitResult {
  jobId: string
  uploadUrl: string
  pollUrl: string
  idempotent?: boolean
}

export interface StatusResult {
  jobId: string
  status: string
  downloadUrl: string | null
  error: string | null
  expiresAt: string | null
}

export interface UsageResult {
  freeTier: { jobsPerMonth: number; jobsRemaining: number }
  creditsBalance: number
  currentWindow: {
    windowStart: string
    key: { jobs: number; bytes: number }
    account: { jobs: number; bytes: number }
  }
}

export interface FormatPair {
  from: string
  to: string
  pair: string
  label: string
  freeMaxMB: number
  costCredits: number
}

export interface FormatsResult {
  pairs: FormatPair[]
}

interface ErrorBody {
  error?: unknown
  code?: unknown
}

export class HushvertClient {
  constructor(private readonly config: Config) {}

  /** Step 1: declare the conversion. Returns the job id + presigned upload URL. */
  async submit(args: { pair: string; bytes: number; idempotencyKey?: string }): Promise<SubmitResult> {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (args.idempotencyKey) headers['idempotency-key'] = args.idempotencyKey
    return this.requestJson<SubmitResult>('/api/v1/conversions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ pair: args.pair, bytes: args.bytes }),
    })
  }

  /** Step 2: PUT the bytes to the presigned R2 URL. No auth header, no extra
   * content-type: the presign signs the content length, which fetch sets from
   * the body, so any extra signed header would break the signature. */
  async upload(uploadUrl: string, bytes: Uint8Array): Promise<void> {
    const res = await this.config.fetchImpl(uploadUrl, { method: 'PUT', body: bytes })
    if (!res.ok) {
      throw new HushvertApiError(`upload failed (${res.status})`, 'upload-failed', res.status)
    }
  }

  /** Step 3: poll job status. */
  async status(jobId: string): Promise<StatusResult> {
    return this.requestJson<StatusResult>(`/api/v1/conversions/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    })
  }

  /** Step 4: GET the converted bytes from the presigned download URL. */
  async download(downloadUrl: string): Promise<Uint8Array> {
    const res = await this.config.fetchImpl(downloadUrl, { method: 'GET' })
    if (!res.ok) {
      throw new HushvertApiError(`download failed (${res.status})`, 'download-failed', res.status)
    }
    return new Uint8Array(await res.arrayBuffer())
  }

  async usage(): Promise<UsageResult> {
    return this.requestJson<UsageResult>('/api/v1/usage', { method: 'GET' })
  }

  /** Discovery. Public endpoint - no key required. */
  async formats(): Promise<FormatsResult> {
    return this.requestJson<FormatsResult>('/api/v1/formats', { method: 'GET' }, false)
  }

  // Issue a request against the API base, attach the bearer key, parse JSON, and
  // turn a non-2xx into a HushvertApiError carrying the typed code. requiresAuth
  // short-circuits to a clean 401 when no key is configured (no pointless round
  // trip, and a clear message even offline).
  private async requestJson<T>(
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
    requiresAuth = true,
  ): Promise<T> {
    if (requiresAuth && !this.config.apiKey) {
      throw new HushvertApiError('no API key configured', 'unauthenticated', 401)
    }
    const headers: Record<string, string> = { ...(init.headers ?? {}) }
    if (this.config.apiKey) headers.authorization = `Bearer ${this.config.apiKey}`

    const res = await this.config.fetchImpl(`${this.config.apiBase}${path}`, {
      method: init.method,
      headers,
      body: init.body,
    })

    if (!res.ok) {
      let code = 'server'
      let message = `request failed (${res.status})`
      try {
        const body = (await res.json()) as ErrorBody
        if (typeof body.code === 'string' && body.code) code = body.code
        if (typeof body.error === 'string' && body.error) message = body.error
      } catch {
        // Non-JSON body: keep the generic message + status-derived code below.
      }
      throw new HushvertApiError(message, code, res.status, res.headers.get('retry-after'))
    }

    return (await res.json()) as T
  }
}
