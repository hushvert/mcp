// Error model. The /api/v1 routes return a typed { error, code } envelope; we
// carry the code so tool handlers can map it to a stable, agent-friendly message
// without ever surfacing a raw body, a stack trace, or the key.

export class HushvertApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAfter: string | null

  constructor(message: string, code: string, status: number, retryAfter: string | null = null) {
    super(message)
    this.name = 'HushvertApiError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }
}

// A non-error refusal: a valid outcome the agent should act on, not a failure.
// Used when the API reports a client-side pair (runs free in the browser).
export interface Refusal {
  refused: true
  reason: string
  suggestion: string
}

export function isRefusal(value: unknown): value is Refusal {
  return typeof value === 'object' && value !== null && (value as Refusal).refused === true
}

// Map an API error code to a stable message for the agent. The message is
// deliberately free of internal detail; the human-readable text from the API is
// only used where it adds the dynamic part (a size limit, an unknown pair name).
export function agentMessage(err: HushvertApiError): string {
  switch (err.code) {
    case 'unauthenticated':
      return 'Invalid or missing hushvert API key. Set HUSHVERT_API_KEY to your hv_live_ key from https://hushvert.com/account.'
    case 'unknown-pair':
      return `${err.message} Call list_formats to see what the hosted API converts.`
    case 'too-large':
      return err.message
    case 'require-credits':
      return `${err.message} Add credits at https://hushvert.com to continue.`
    case 'rate-limited':
      return err.retryAfter
        ? `Rate limited by the hushvert API. Retry after ${err.retryAfter} seconds.`
        : 'Rate limited by the hushvert API. Please retry shortly.'
    case 'forbidden':
      return 'That conversion job belongs to a different account.'
    case 'not-found':
      return 'No such conversion job.'
    case 'unavailable':
      return 'The hushvert conversion engine is temporarily unavailable. Retry shortly.'
    default:
      return 'The hushvert API request failed. Retry shortly.'
  }
}
