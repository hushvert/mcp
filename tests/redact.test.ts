import { describe, expect, it } from 'vitest'
import { redact } from '../src/redact'

describe('redact', () => {
  it('masks the exact configured key', () => {
    const key = 'hv_live_secret_value_123'
    expect(redact(`auth failed for ${key} now`, key)).toBe('auth failed for hv_live_*** now')
  })

  it('masks any hv_live_ token even if the key is unknown', () => {
    expect(redact('Bearer hv_live_abcDEF-123_xyz leaked', null)).toBe('Bearer hv_live_*** leaked')
  })

  it('leaves non-key text untouched', () => {
    expect(redact('nothing secret here', 'hv_live_x')).toBe('nothing secret here')
  })
})
