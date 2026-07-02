import { describe, expect, it } from 'vitest'
import { agentMessage, HushvertApiError, isRefusal } from '../src/errors'

describe('agentMessage', () => {
  it('maps unauthenticated to a key-setup hint', () => {
    const msg = agentMessage(new HushvertApiError('x', 'unauthenticated', 401))
    expect(msg).toMatch(/HUSHVERT_API_KEY/)
  })

  it('maps require-credits with an add-credits pointer', () => {
    const msg = agentMessage(new HushvertApiError('monthly free conversions used', 'require-credits', 402))
    expect(msg).toMatch(/monthly free conversions used/)
    expect(msg).toMatch(/Add credits/)
  })

  it('includes Retry-After for rate limits when present', () => {
    expect(agentMessage(new HushvertApiError('slow down', 'rate-limited', 429, '30'))).toMatch(/30 seconds/)
    expect(agentMessage(new HushvertApiError('slow down', 'rate-limited', 429))).toMatch(/retry shortly/i)
  })

  it('keeps unknown-pair message and steers to list_formats', () => {
    const msg = agentMessage(new HushvertApiError('unknown pair "x-to-y"', 'unknown-pair', 400))
    expect(msg).toMatch(/list_formats/)
  })
})

describe('isRefusal', () => {
  it('detects a refusal object', () => {
    expect(isRefusal({ refused: true, reason: 'r', suggestion: 's' })).toBe(true)
    expect(isRefusal({ ok: 1 })).toBe(false)
    expect(isRefusal(null)).toBe(false)
  })
})
