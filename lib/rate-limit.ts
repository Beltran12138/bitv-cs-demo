const store = new Map<string, { count: number; reset: number }>()

export function checkRateLimit(
  ip: string,
  limit = 20,
  windowMs = 60_000,
): boolean {
  const now = Date.now()
  const record = store.get(ip)

  if (!record || now > record.reset) {
    store.set(ip, { count: 1, reset: now + windowMs })
    return true
  }

  if (record.count >= limit) return false
  record.count++
  return true
}
