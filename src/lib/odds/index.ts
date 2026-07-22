import { createAdminClient } from '@/lib/supabase/admin'
import { claimRefresh } from '@/lib/data-refresh'
import { getOutrights, hasOddsApiKey } from './the-odds-api'
import { normalizeName } from './match'

/**
 * Generic cached odds layer (The Odds API → cached_odds table), reusable by
 * any game type that needs win odds. Staleness-gated via the shared
 * claimRefresh mechanism, but ONLY invoked from explicit admin actions —
 * the free API tier (~500 req/mo) can't support page-load fetching.
 */

const ODDS_STALE_MS = 30 * 60 * 1000

export interface CachedOdds {
  sport_key: string
  event_key: string
  participant: string
  participant_norm: string
  price: number
  bookmaker: string
  fetched_at: string
}

type Admin = ReturnType<typeof createAdminClient>

/** Refresh cached outright odds for a sport key if stale. No-op without an API key. */
export async function ensureFreshOdds(
  sportKey: string,
  staleMs: number = ODDS_STALE_MS
): Promise<void> {
  if (!hasOddsApiKey()) return
  const admin = createAdminClient()
  try {
    if (!(await claimRefresh(admin, `odds:${sportKey}`, staleMs))) return
    const rows = await getOutrights(sportKey)
    if (rows.length === 0) return
    const fetchedAt = new Date().toISOString()
    const { error } = await admin.from('cached_odds').upsert(
      rows.map((r) => ({
        sport_key: sportKey,
        event_key: r.eventKey,
        participant: r.participant,
        participant_norm: normalizeName(r.participant),
        price: r.price,
        bookmaker: r.bookmaker,
        fetched_at: fetchedAt,
      })),
      { onConflict: 'sport_key,participant_norm,bookmaker' }
    )
    if (error) throw new Error(error.message)
    // Prune participants no longer offered (field changes)
    await admin.from('cached_odds').delete().eq('sport_key', sportKey).lt('fetched_at', fetchedAt)
  } catch (err) {
    console.error(`ensureFreshOdds(${sportKey}) failed:`, err)
  }
}

/**
 * Read cached odds for a sport, one price per participant (preferred
 * bookmaker first, then any). Keyed by normalized participant name.
 */
export async function getCachedOdds(
  admin: Admin,
  sportKey: string,
  preferredBookmaker = 'draftkings'
): Promise<Map<string, number>> {
  const { data } = await admin
    .from('cached_odds')
    .select('participant_norm,price,bookmaker')
    .eq('sport_key', sportKey)
  const byParticipant = new Map<string, number>()
  for (const row of data ?? []) {
    if (row.bookmaker === preferredBookmaker || !byParticipant.has(row.participant_norm)) {
      byParticipant.set(row.participant_norm, row.price)
    }
  }
  return byParticipant
}
