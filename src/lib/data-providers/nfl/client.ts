const NFL_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/'

const TIMEOUT_MS = 10_000
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_RETRY_DELAY_MS = 5_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// no-store: our own staleness gate (data_refresh table) controls fetch frequency,
// and live scores must not be served from the framework cache.
//
// Per-request timeout + one retry on rate-limit/5xx (honoring Retry-After,
// capped). Anything beyond that throws — callers tolerate partial failures
// and the staleness claim prevents hammering a failing API.
export async function nflFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, NFL_BASE_URL)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      // Timeout / network error: one retry
      if (attempt === 0) {
        await sleep(1_000)
        continue
      }
      throw new Error(`ESPN NFL API unreachable: ${err instanceof Error ? err.message : err}`)
    }

    if (res.ok) return res.json()

    if (attempt === 0 && RETRYABLE_STATUSES.has(res.status)) {
      const retryAfterSec = Number(res.headers.get('retry-after'))
      const delay =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0
          ? Math.min(retryAfterSec * 1_000, MAX_RETRY_DELAY_MS)
          : 1_000
      await sleep(delay)
      continue
    }

    throw new Error(`ESPN NFL API error: ${res.status} ${res.statusText}`)
  }
}
