import { describe, expect, test } from 'vitest'
import { writtenRange } from './assay'

describe('a grade as written', () => {
  test('covers what its rounding allows, in %', () => {
    const six = writtenRange('6 ppm')!
    expect(six.lo).toBeCloseTo(5.5e-4, 12)
    expect(six.hi).toBeCloseTo(6.5e-4, 12)
    const r = writtenRange('0.002%')!
    expect(r.lo).toBeCloseTo(0.0015, 10)
    expect(r.hi).toBeCloseTo(0.0025, 10)
    const big = writtenRange('1,002 ppm')!
    expect(big.lo).toBeCloseTo(0.10015, 10)
  })

  test('below detection runs from 0 to the limit', () => {
    expect(writtenRange('<10 ppb')).toEqual({ lo: 0, hi: 10e-7 })
  })

  test('no number, no range', () => {
    expect(writtenRange('n/a')).toBeNull()
  })
})
