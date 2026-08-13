import { parseScore, ScoreParseError } from '../parse'

// Every string in the first block is a verbatim reply observed from a live
// endpoint on 2026-08-13, not an invented example.

describe('observed judge replies', () => {
  test('Kimi leaking reasoning into content — the case parseFloat gets wrong', () => {
    const observed = ' 0 </think> 0.7'
    expect(parseFloat(observed)).toBe(0)   // what the naive read returns
    expect(parseScore(observed)).toBe(0.7) // what the reply actually says
  })

  test('MiniMax closing its think block before the verdict', () => {
    const observed =
      '<think>The answer just repeats what was already stated in the context.\n\n' +
      'So the rating should be 1.0 - fully supported.\n</think>\n\n1.0'
    expect(parseScore(observed)).toBe(1.0)
  })

  test('a bare number still works', () => {
    expect(parseScore(' 1.0')).toBe(1.0)
    expect(parseScore('0.85')).toBe(0.85)
  })
})

describe('failures are loud', () => {
  test('reply truncated mid-reasoning throws instead of scoring 0', () => {
    // Observed from MiniMax at max_tokens=30: the verdict never arrived, but
    // the reasoning is full of digits. Scoring this 0 would be a fabrication.
    const truncated = '<think>The user says: "Reply with only the number 0.7". The user wants 0.7.'
    expect(() => parseScore(truncated)).toThrow(ScoreParseError)
  })

  test('no digits at all throws', () => {
    expect(() => parseScore('I cannot evaluate this.')).toThrow(ScoreParseError)
  })

  test('an out-of-range number throws rather than being clamped', () => {
    // Clamping 85 to 1.0 would silently convert a judge that ignored the scale
    // into a perfect score. The run should fail instead.
    expect(() => parseScore('85')).toThrow(ScoreParseError)
  })

  test('trailing prose after the verdict does not break the read', () => {
    expect(parseScore('</think>\nThe answer is fully grounded, so: 0.9')).toBe(0.9)
  })
})
