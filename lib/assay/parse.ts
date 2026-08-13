/**
 * Reading a score out of a judge's reply.
 *
 * This is not incidental plumbing. Reasoning models leak their chain of thought
 * into `content`, and the leaked text contains digits. A naive
 * `parseFloat(content)` on an observed Kimi reply — `" 0 </think> 0.7"` —
 * returns 0, not 0.7. Silently.
 *
 * A judge pipeline that reads 0 whenever parsing fails does not produce noisy
 * data; it produces a confident, wrong, and very publishable-looking result:
 * the cross-family judge appears to score everything near zero, which reads as
 * an enormous self-preference effect. Hence: strip the reasoning, and throw
 * rather than guess.
 */

export class ScoreParseError extends Error {
  constructor(readonly raw: string) {
    super(`could not read a 0..1 score from judge reply: ${JSON.stringify(raw.slice(0, 200))}`)
    this.name = 'ScoreParseError'
  }
}

/**
 * Text after the final `</think>`, or the whole string when there is none.
 *
 * Also needed on the generation side: an answer produced by a reasoning model
 * carries its scratchpad in `content`, and grading that scratchpad as if it
 * were the answer measures something else entirely.
 */
export function stripReasoning(raw: string): string {
  const close = raw.lastIndexOf('</think>')
  if (close !== -1) return raw.slice(close + '</think>'.length)
  // An unclosed <think> means the reply was truncated mid-reasoning: there is
  // no verdict in it at all, and whatever digits it contains are not a score.
  if (raw.includes('<think>')) return ''
  return raw
}

/**
 * Extracts a 0..1 score. Throws `ScoreParseError` rather than defaulting,
 * so a broken judge shows up as a failed run instead of a low score.
 */
export function parseScore(raw: string): number {
  const text = stripReasoning(raw).trim()
  // Last number wins: models that ignore "reply with only a number" tend to
  // restate the verdict at the end ("...so the rating should be 1.0").
  const matches = text.match(/\d+(?:\.\d+)?/g)
  if (!matches || matches.length === 0) throw new ScoreParseError(raw)

  const n = parseFloat(matches[matches.length - 1])
  if (isNaN(n) || n < 0 || n > 1) throw new ScoreParseError(raw)
  return n
}
