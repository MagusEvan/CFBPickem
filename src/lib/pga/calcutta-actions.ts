'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers } from '@/lib/pga/queries'
import { buildLots, validateBid, nextLot } from '@/lib/calcutta/engine'
import { validateCalcuttaSettings, DEFAULT_CALCUTTA_SETTINGS, type CalcuttaSettings } from '@/lib/pga/calcutta-types'
import type { PgaCalcuttaLot, PgaDraftState, PgaTournament } from '@/lib/types'

type Admin = ReturnType<typeof createAdminClient>

// ============================================================
// Helpers
// ============================================================

async function requireCalcuttaAdmin(
  tournamentId: string,
  poolId: string
): Promise<{ tournament: PgaTournament } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const pool = await getPool(poolId)
  if (!pool || pool.admin_id !== user.id) return { error: 'Only the league admin can do this' }

  const tournament = await getTournament(tournamentId)
  if (!tournament || tournament.pool_id !== poolId) return { error: 'Tournament not found' }
  if (tournament.draft_type !== 'calcutta') return { error: 'Not a Calcutta tournament' }
  return { tournament }
}

function settingsOf(tournament: PgaTournament): CalcuttaSettings {
  return tournament.calcutta_settings ?? DEFAULT_CALCUTTA_SETTINGS
}

function revalidateTournament(poolId: string, tournamentId: string) {
  revalidatePath(`/pools/${poolId}/tournaments/${tournamentId}`)
  revalidatePath(`/pools/${poolId}/tournaments/${tournamentId}/draft`)
  revalidatePath(`/pools/${poolId}/tournaments/${tournamentId}/standings`)
}

/** Rebuild the lot list from golfer odds + scraps settings. Pre-draft only. */
async function regenerateLots(
  admin: Admin,
  tournament: PgaTournament
): Promise<string | null> {
  const settings = settingsOf(tournament)
  const { data: golfers } = await admin
    .from('pga_golfers')
    .select('id,name,calcutta_odds')
    .eq('tournament_id', tournament.id)
  if (!golfers || golfers.length === 0) return 'No golfers in the field yet'

  // Preserve curated scraps assignments across regenerations
  const { data: oldLots } = await admin
    .from('pga_calcutta_lots')
    .select('*')
    .eq('tournament_id', tournament.id)
    .order('lot_order')
  const curatedAssignments = new Map<number, string[]>()
  if (settings.scraps.split === 'curated') {
    let pkgIdx = 0
    for (const lot of (oldLots ?? []) as PgaCalcuttaLot[]) {
      if (lot.kind === 'scraps') curatedAssignments.set(pkgIdx++, lot.golfer_ids)
    }
  }

  const items = golfers.map((g) => ({ id: g.id, name: g.name, odds: g.calcutta_odds }))
  const descriptors = buildLots(items, settings.scraps)

  // Curated: keep previous assignments where the golfers still qualify as scraps
  if (settings.scraps.split === 'curated') {
    const scrapsEligible = new Set(
      items
        .filter((i) => i.odds === null || i.odds > settings.scraps.thresholdOdds)
        .map((i) => i.id)
    )
    let pkgIdx = 0
    for (const d of descriptors) {
      if (d.kind !== 'scraps') continue
      d.itemIds = (curatedAssignments.get(pkgIdx++) ?? []).filter((id) => scrapsEligible.has(id))
    }
  }

  await admin.from('pga_calcutta_lots').delete().eq('tournament_id', tournament.id)
  if (descriptors.length > 0) {
    const { error } = await admin.from('pga_calcutta_lots').insert(
      descriptors.map((d, i) => ({
        tournament_id: tournament.id,
        lot_order: i + 1,
        kind: d.kind,
        label: d.label,
        golfer_ids: d.itemIds,
      }))
    )
    if (error) return error.message
  }
  return null
}

// ============================================================
// Pre-draft setup
// ============================================================

export async function updateCalcuttaSettings(
  tournamentId: string,
  poolId: string,
  settings: CalcuttaSettings
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Settings are locked once the auction has started' }
  }

  const validationError = validateCalcuttaSettings(settings)
  if (validationError) return { error: validationError }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pga_tournaments')
    .update({ calcutta_settings: settings })
    .eq('id', tournamentId)
  if (error) return { error: error.message }

  const regenError = await regenerateLots(admin, { ...auth.tournament, calcutta_settings: settings })
  if (regenError) return { error: regenError }

  revalidateTournament(poolId, tournamentId)
  return {}
}

export async function updateGolferOdds(
  tournamentId: string,
  poolId: string,
  golferId: string,
  odds: number | null
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Odds are locked once the auction has started' }
  }
  if (odds !== null && (!Number.isInteger(odds) || odds < -100000 || odds > 10000000)) {
    return { error: 'Invalid odds value' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pga_golfers')
    .update({ calcutta_odds: odds, odds_source: odds === null ? null : 'manual' })
    .eq('tournament_id', tournamentId)
    .eq('id', golferId)
  if (error) return { error: error.message }

  const regenError = await regenerateLots(admin, auth.tournament)
  if (regenError) return { error: regenError }

  revalidateTournament(poolId, tournamentId)
  return {}
}

/** Fetch win odds from The Odds API and match them onto the golfer field. */
export async function seedCalcuttaOddsFromApi(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string; matched?: number; total?: number }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Odds are locked once the auction has started' }
  }

  const { hasOddsApiKey, listSports } = await import('@/lib/odds/the-odds-api')
  if (!hasOddsApiKey()) {
    return { error: 'No Odds API key is configured (ODDS_API_KEY). Enter odds manually instead.' }
  }

  const { findGolfSportKey, normalizeName } = await import('@/lib/odds/match')
  const { ensureFreshOdds, getCachedOdds } = await import('@/lib/odds')

  let sportKey: string | null
  try {
    sportKey = findGolfSportKey(await listSports(), auth.tournament.name)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to reach The Odds API' }
  }
  if (!sportKey) {
    return { error: `Could not find a matching odds market for "${auth.tournament.name}". Enter odds manually instead.` }
  }

  await ensureFreshOdds(sportKey)

  const admin = createAdminClient()
  const oddsByName = await getCachedOdds(admin, sportKey)
  if (oddsByName.size === 0) {
    return { error: 'No odds available yet for this event. Try again closer to the tournament.' }
  }

  const { data: golfers } = await admin
    .from('pga_golfers')
    .select('id,name,odds_source')
    .eq('tournament_id', tournamentId)

  let matched = 0
  for (const g of golfers ?? []) {
    if (g.odds_source === 'manual') continue // never clobber manual overrides
    const price = oddsByName.get(normalizeName(g.name))
    if (price === undefined) continue
    await admin
      .from('pga_golfers')
      .update({ calcutta_odds: price, odds_source: 'the-odds-api' })
      .eq('tournament_id', tournamentId)
      .eq('id', g.id)
    matched++
  }

  const regenError = await regenerateLots(admin, auth.tournament)
  if (regenError) return { error: regenError }

  revalidateTournament(poolId, tournamentId)
  return { matched, total: golfers?.length ?? 0 }
}

export async function regenerateCalcuttaLots(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Lots are locked once the auction has started' }
  }
  const admin = createAdminClient()
  const regenError = await regenerateLots(admin, auth.tournament)
  if (regenError) return { error: regenError }
  revalidateTournament(poolId, tournamentId)
  return {}
}

export async function reorderCalcuttaLots(
  tournamentId: string,
  poolId: string,
  orderedLotIds: string[]
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Lot order is locked once the auction has started' }
  }

  const admin = createAdminClient()
  const { data: lots } = await admin
    .from('pga_calcutta_lots')
    .select('id')
    .eq('tournament_id', tournamentId)
  const existing = new Set((lots ?? []).map((l) => l.id))
  if (
    orderedLotIds.length !== existing.size ||
    !orderedLotIds.every((id) => existing.has(id))
  ) {
    return { error: 'Lot list is out of date — refresh and try again' }
  }

  // Two-phase update to avoid unique(tournament_id, lot_order) collisions
  for (let i = 0; i < orderedLotIds.length; i++) {
    await admin
      .from('pga_calcutta_lots')
      .update({ lot_order: i + 1 + 100000 })
      .eq('id', orderedLotIds[i])
  }
  for (let i = 0; i < orderedLotIds.length; i++) {
    await admin
      .from('pga_calcutta_lots')
      .update({ lot_order: i + 1 })
      .eq('id', orderedLotIds[i])
  }

  revalidateTournament(poolId, tournamentId)
  return {}
}

/** Curated scraps: move a golfer into a package (or out with lotId=null). */
export async function assignScrapsGolfer(
  tournamentId: string,
  poolId: string,
  golferId: string,
  lotId: string | null
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'pre_draft') {
    return { error: 'Packages are locked once the auction has started' }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('pga_calcutta_lots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('kind', 'scraps')
  const scrapsLots = (data ?? []) as PgaCalcuttaLot[]

  if (lotId && !scrapsLots.some((l) => l.id === lotId)) {
    return { error: 'Package not found' }
  }

  for (const lot of scrapsLots) {
    const has = lot.golfer_ids.includes(golferId)
    const shouldHave = lot.id === lotId
    if (has === shouldHave) continue
    const golfer_ids = shouldHave
      ? [...lot.golfer_ids, golferId]
      : lot.golfer_ids.filter((id) => id !== golferId)
    const { error } = await admin
      .from('pga_calcutta_lots')
      .update({ golfer_ids })
      .eq('id', lot.id)
    if (error) return { error: error.message }
  }

  revalidateTournament(poolId, tournamentId)
  return {}
}

// ============================================================
// Auction lifecycle
// ============================================================

export async function startCalcuttaAuction(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  const { tournament } = auth
  if (tournament.draft_status !== 'pre_draft') return { error: 'Auction already started' }

  const settings = settingsOf(tournament)
  const validationError = validateCalcuttaSettings(settings)
  if (validationError) return { error: `Fix settings first: ${validationError}` }

  const members = await getTournamentMembers(tournamentId)
  if (members.length < 2) return { error: 'Need at least 2 participants' }

  const admin = createAdminClient()

  // Persist settings in case the tournament still has defaults
  if (!tournament.calcutta_settings) {
    await admin.from('pga_tournaments').update({ calcutta_settings: settings }).eq('id', tournamentId)
  }

  let { data } = await admin
    .from('pga_calcutta_lots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('lot_order')
  if (!data || data.length === 0) {
    const regenError = await regenerateLots(admin, tournament)
    if (regenError) return { error: regenError }
    ;({ data } = await admin
      .from('pga_calcutta_lots')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('lot_order'))
  }
  let lots = (data ?? []) as PgaCalcuttaLot[]

  // Drop empty scraps packages (e.g. curated packages never filled)
  const emptyIds = lots.filter((l) => l.golfer_ids.length === 0).map((l) => l.id)
  if (emptyIds.length > 0) {
    await admin.from('pga_calcutta_lots').delete().in('id', emptyIds)
    lots = lots.filter((l) => l.golfer_ids.length > 0)
  }
  if (lots.length === 0) return { error: 'No lots to auction — check the golfer field and scraps settings' }

  const firstLot = lots[0]
  await admin.from('pga_calcutta_lots').update({ status: 'open' }).eq('id', firstLot.id)

  const { error: stateErr } = await admin.from('pga_draft_state').insert({
    tournament_id: tournamentId,
    current_round: 1,
    current_pick_number: 1,
    current_member_id: null,
    current_lot_id: firstLot.id,
    lot_high_bid: null,
    lot_high_bidder_id: null,
    lot_deadline:
      settings.mode === 'live'
        ? new Date(Date.now() + settings.timerSeconds * 1000).toISOString()
        : null,
    auction_cycle: 1,
  })
  if (stateErr) return { error: stateErr.message }

  await admin.from('pga_tournaments').update({ draft_status: 'in_progress' }).eq('id', tournamentId)

  revalidateTournament(poolId, tournamentId)
  return {}
}

export async function placeCalcuttaBid(
  tournamentId: string,
  poolId: string,
  amount: number,
  onBehalfOfMemberId?: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const [tournament, pool] = await Promise.all([getTournament(tournamentId), getPool(poolId)])
  if (!tournament || !pool || tournament.pool_id !== poolId) return { error: 'Tournament not found' }
  if (tournament.draft_type !== 'calcutta') return { error: 'Not a Calcutta tournament' }
  if (tournament.draft_status !== 'in_progress') return { error: 'Auction is not in progress' }

  const settings = settingsOf(tournament)
  if (settings.mode !== 'live') return { error: 'This auction uses admin entry, not live bidding' }

  const members = await getTournamentMembers(tournamentId)
  const caller = members.find((m) => m.pool_member?.user_id === user.id)
  if (!caller && pool.admin_id !== user.id) return { error: 'You are not a participant in this tournament' }

  let bidder = caller
  if (onBehalfOfMemberId && onBehalfOfMemberId !== caller?.id) {
    if (pool.admin_id !== user.id) return { error: 'Only the league admin can bid on behalf of others' }
    bidder = members.find((m) => m.id === onBehalfOfMemberId)
  }
  if (!bidder) return { error: 'Bidder not found' }

  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single()
  const state = stateData as PgaDraftState | null
  if (!state?.current_lot_id) return { error: 'No lot is open for bidding' }
  if (state.lot_deadline && new Date(state.lot_deadline).getTime() < Date.now()) {
    return { error: 'Bidding on this lot has closed' }
  }

  const bidError = validateBid({
    currentHigh: state.lot_high_bid,
    amount,
    minOpening: settings.minOpeningBid,
    minRaise: settings.minRaise,
  })
  if (bidError) return { error: bidError }

  // Atomic against concurrent bids: only matches if the high bid is unchanged
  let update = admin
    .from('pga_draft_state')
    .update({
      lot_high_bid: amount,
      lot_high_bidder_id: bidder.id,
      lot_deadline: new Date(Date.now() + settings.timerSeconds * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('tournament_id', tournamentId)
    .eq('current_lot_id', state.current_lot_id)
  update =
    state.lot_high_bid === null
      ? update.is('lot_high_bid', null)
      : update.eq('lot_high_bid', state.lot_high_bid)
  const { data: updated } = await update.select('tournament_id')
  if (!updated || updated.length === 0) {
    return { error: 'Another bid came in first — try again' }
  }

  await admin.from('pga_calcutta_bids').insert({
    tournament_id: tournamentId,
    lot_id: state.current_lot_id,
    member_id: bidder.id,
    amount,
  })

  return {}
}

/**
 * Close the current lot and advance. Used by the admin hammer, the expiry
 * path, and admin-entry recording. Guarded so only one closer wins.
 */
async function closeLotAndAdvance(
  admin: Admin,
  tournament: PgaTournament,
  lotId: string,
  winnerMemberId: string | null,
  price: number | null
): Promise<{ error?: string }> {
  // Claim the close: only one concurrent caller flips open -> closed
  const sold = winnerMemberId !== null && price !== null
  const { data: claimed } = await admin
    .from('pga_calcutta_lots')
    .update({
      status: sold ? 'sold' : 'unsold',
      winner_member_id: sold ? winnerMemberId : null,
      price: sold ? price : null,
      sold_at: sold ? new Date().toISOString() : null,
    })
    .eq('id', lotId)
    .eq('status', 'open')
    .select('*')
  if (!claimed || claimed.length === 0) return { error: 'Lot already closed' }
  const lot = claimed[0] as PgaCalcuttaLot

  // Sold: insert picks so rosters/leaderboards keep working
  if (sold && lot.golfer_ids.length > 0) {
    const { data: golfers } = await admin
      .from('pga_golfers')
      .select('id,name')
      .eq('tournament_id', tournament.id)
      .in('id', lot.golfer_ids)
    const nameById = new Map((golfers ?? []).map((g) => [g.id, g.name]))

    const { data: maxPick } = await admin
      .from('pga_draft_picks')
      .select('pick_number')
      .eq('tournament_id', tournament.id)
      .order('pick_number', { ascending: false })
      .limit(1)
    let pickNumber = (maxPick?.[0]?.pick_number ?? 0) + 1

    const { error: pickErr } = await admin.from('pga_draft_picks').insert(
      lot.golfer_ids.map((golferId, i) => ({
        tournament_id: tournament.id,
        member_id: winnerMemberId,
        round: 1,
        pick_number: pickNumber++,
        golfer_id: golferId,
        golfer_name: nameById.get(golferId) ?? 'Unknown',
        // Price on the first pick only so summing pick prices equals the pot
        price: i === 0 ? price : null,
        lot_id: lotId,
      }))
    )
    if (pickErr) return { error: pickErr.message }
  }

  // Advance to the next lot
  const settings = settingsOf(tournament)
  const { data: lotsData } = await admin
    .from('pga_calcutta_lots')
    .select('id,status')
    .eq('tournament_id', tournament.id)
    .order('lot_order')
  let lots = (lotsData ?? []) as Array<Pick<PgaCalcuttaLot, 'id' | 'status'>>

  let result = nextLot(lots)
  let cycleBump = 0
  if (result.action === 'recycle') {
    await admin
      .from('pga_calcutta_lots')
      .update({ status: 'pending' })
      .eq('tournament_id', tournament.id)
      .eq('status', 'unsold')
    lots = lots.map((l) => (l.status === 'unsold' ? { ...l, status: 'pending' as const } : l))
    result = nextLot(lots)
    cycleBump = 1
  }

  if (result.action === 'open') {
    await admin.from('pga_calcutta_lots').update({ status: 'open' }).eq('id', result.lotId)
    const { data: stateRow } = await admin
      .from('pga_draft_state')
      .select('auction_cycle')
      .eq('tournament_id', tournament.id)
      .single()
    await admin
      .from('pga_draft_state')
      .update({
        current_lot_id: result.lotId,
        lot_high_bid: null,
        lot_high_bidder_id: null,
        lot_deadline:
          settings.mode === 'live'
            ? new Date(Date.now() + settings.timerSeconds * 1000).toISOString()
            : null,
        auction_cycle: (stateRow?.auction_cycle ?? 1) + cycleBump,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournament.id)
  } else {
    await admin
      .from('pga_draft_state')
      .update({
        current_lot_id: null,
        lot_high_bid: null,
        lot_high_bidder_id: null,
        lot_deadline: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tournament_id', tournament.id)
    await admin
      .from('pga_tournaments')
      .update({ draft_status: 'completed' })
      .eq('id', tournament.id)
  }

  return {}
}

/** Admin hammer: lock in the current high bid immediately (or pass if no bids). */
export async function hammerCalcuttaLot(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'in_progress') return { error: 'Auction is not in progress' }

  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single()
  const state = stateData as PgaDraftState | null
  if (!state?.current_lot_id) return { error: 'No lot is open' }

  const result = await closeLotAndAdvance(
    admin,
    auth.tournament,
    state.current_lot_id,
    state.lot_high_bidder_id,
    state.lot_high_bid
  )
  if (result.error) return result

  revalidateTournament(poolId, tournamentId)
  return {}
}

/** Client-invoked when the countdown hits zero; the server re-verifies expiry. */
export async function closeCalcuttaLotIfExpired(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const tournament = await getTournament(tournamentId)
  if (!tournament || tournament.pool_id !== poolId) return { error: 'Tournament not found' }
  if (tournament.draft_status !== 'in_progress') return {}

  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single()
  const state = stateData as PgaDraftState | null
  if (!state?.current_lot_id || !state.lot_deadline) return {}
  if (new Date(state.lot_deadline).getTime() > Date.now()) return {} // not expired

  await closeLotAndAdvance(
    admin,
    tournament,
    state.current_lot_id,
    state.lot_high_bidder_id,
    state.lot_high_bid
  )

  revalidateTournament(poolId, tournamentId)
  return {}
}

/** Admin-entry mode: record the in-person result for the current lot. */
export async function recordCalcuttaLotResult(
  tournamentId: string,
  poolId: string,
  winnerMemberId: string | null,
  price: number | null
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  if (auth.tournament.draft_status !== 'in_progress') return { error: 'Auction is not in progress' }

  if (winnerMemberId !== null) {
    if (price === null || !Number.isFinite(price) || price <= 0) {
      return { error: 'Enter a positive winning price' }
    }
    const members = await getTournamentMembers(tournamentId)
    if (!members.some((m) => m.id === winnerMemberId)) return { error: 'Winner not found' }
  }

  const admin = createAdminClient()
  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('current_lot_id')
    .eq('tournament_id', tournamentId)
    .single()
  if (!stateData?.current_lot_id) return { error: 'No lot is open' }

  const result = await closeLotAndAdvance(
    admin,
    auth.tournament,
    stateData.current_lot_id,
    winnerMemberId,
    winnerMemberId === null ? null : price
  )
  if (result.error) return result

  revalidateTournament(poolId, tournamentId)
  return {}
}

/** Reopen the most recently closed lot (undo). */
export async function undoLastCalcuttaLot(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }
  const { tournament } = auth
  if (tournament.draft_status === 'pre_draft') return { error: 'Auction has not started' }

  const admin = createAdminClient()
  const { data: lotsData } = await admin
    .from('pga_calcutta_lots')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('lot_order')
  const lots = (lotsData ?? []) as PgaCalcuttaLot[]

  // Most recently closed: prefer latest sold_at, fall back to last unsold in order
  const closed = lots.filter((l) => l.status === 'sold' || l.status === 'unsold')
  if (closed.length === 0) return { error: 'No closed lots to undo' }
  const lastClosed = [...closed].sort((a, b) => {
    const at = a.sold_at ? new Date(a.sold_at).getTime() : 0
    const bt = b.sold_at ? new Date(b.sold_at).getTime() : 0
    return bt - at || b.lot_order - a.lot_order
  })[0]

  // Delete its picks and put the currently open lot (if any) back to pending
  await admin.from('pga_draft_picks').delete().eq('lot_id', lastClosed.id)
  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('current_lot_id')
    .eq('tournament_id', tournamentId)
    .single()
  if (stateData?.current_lot_id) {
    await admin
      .from('pga_calcutta_lots')
      .update({ status: 'pending' })
      .eq('id', stateData.current_lot_id)
  }

  await admin
    .from('pga_calcutta_lots')
    .update({ status: 'open', winner_member_id: null, price: null, sold_at: null })
    .eq('id', lastClosed.id)

  const settings = settingsOf(tournament)
  await admin
    .from('pga_draft_state')
    .update({
      current_lot_id: lastClosed.id,
      lot_high_bid: null,
      lot_high_bidder_id: null,
      lot_deadline:
        settings.mode === 'live'
          ? new Date(Date.now() + settings.timerSeconds * 1000).toISOString()
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq('tournament_id', tournamentId)

  if (tournament.draft_status === 'completed') {
    await admin
      .from('pga_tournaments')
      .update({ draft_status: 'in_progress' })
      .eq('id', tournamentId)
  }

  revalidateTournament(poolId, tournamentId)
  return {}
}

export async function resetCalcuttaAuction(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const auth = await requireCalcuttaAdmin(tournamentId, poolId)
  if ('error' in auth) return { error: auth.error }

  const admin = createAdminClient()
  await admin.from('pga_draft_picks').delete().eq('tournament_id', tournamentId)
  await admin.from('pga_calcutta_bids').delete().eq('tournament_id', tournamentId)
  await admin.from('pga_draft_state').delete().eq('tournament_id', tournamentId)
  await admin
    .from('pga_calcutta_lots')
    .update({ status: 'pending', winner_member_id: null, price: null, sold_at: null })
    .eq('tournament_id', tournamentId)
  await admin
    .from('pga_tournaments')
    .update({ draft_status: 'pre_draft' })
    .eq('id', tournamentId)

  revalidateTournament(poolId, tournamentId)
  return {}
}
