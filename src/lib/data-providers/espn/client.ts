const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football'

export async function espnFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, ESPN_BASE_URL)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    throw new Error(`ESPN API error: ${res.status} ${res.statusText}`)
  }

  return res.json()
}
