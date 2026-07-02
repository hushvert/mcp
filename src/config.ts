// Runtime configuration, read once from the environment. The API key is the
// user's hushvert developer key (hv_live_...), supplied via the MCP server's
// `env` block in the host config; it is never committed and never logged (see
// redact.ts). Numeric envs are validated the same way the API routes validate
// theirs: a malformed value (NaN) falls back to the documented default rather
// than silently disabling a bound.

export interface Config {
  /** Base URL of the hosted API. Default https://hushvert.com. */
  apiBase: string
  /** The hv_live_ developer key, or null if unset (tools then 401 cleanly). */
  apiKey: string | null
  /** Default seconds convert_file blocks polling before returning the async shape. */
  defaultWaitSeconds: number
  /** Delay between status polls. */
  pollIntervalMs: number
  /** Client-side circuit breaker: max convert jobs per server session. Infinity = off. */
  maxJobsPerSession: number
  /** If set, every file read/write must resolve under this directory. */
  allowedDir: string | null
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl: typeof fetch
}

function intEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiBase = (env.HUSHVERT_API_BASE ?? 'https://hushvert.com').replace(/\/$/, '')
  const apiKey = env.HUSHVERT_API_KEY?.trim() || null
  const maxRaw = env.HUSHVERT_MAX_JOBS_PER_SESSION
  // Unset => unlimited (Infinity). A malformed value falls back to unlimited too
  // rather than accidentally pinning the breaker at some surprising number.
  const maxJobsPerSession =
    maxRaw === undefined || maxRaw.trim() === ''
      ? Number.POSITIVE_INFINITY
      : (() => {
          const n = Number(maxRaw)
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : Number.POSITIVE_INFINITY
        })()
  const allowedDir = env.HUSHVERT_ALLOWED_DIR?.trim() || null

  return {
    apiBase,
    apiKey,
    defaultWaitSeconds: intEnv(env.HUSHVERT_DEFAULT_WAIT_SECONDS, 120),
    pollIntervalMs: intEnv(env.HUSHVERT_POLL_INTERVAL_MS, 1500),
    maxJobsPerSession,
    allowedDir,
    fetchImpl: globalThis.fetch,
  }
}
