'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPool, getPoolMembers } from '@/lib/pools/queries'
import { getTournament, getTournamentMembers } from '@/lib/pga/queries'
import { generateSnakeOrder, getPickInfo } from '@/lib/draft/engine'
import type { PgaTournamentMember, PgaDraftState, PgaDraftPick } from '@/lib/types'

export async function createTournament(formData: FormData): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const poolId = formData.get('pool_id') as string
  const pool = await getPool(poolId)
  if (!pool) throw new Error('Pool not found')
  if (pool.admin_id !== user.id) throw new Error('Only the league admin can create tournaments')
  if (pool.game_type !== 'pga') throw new Error('Pool is not a PGA league')

  const name = formData.get('name') as string
  const espnEventId = (formData.get('espn_event_id') as string) || null
  const seasonYear = Number(formData.get('season_year') || pool.season_year)
  const startDate = (formData.get('start_date') as string) || null
  const endDate = (formData.get('end_date') as string) || null
  const golfersPerManager = Number(formData.get('golfers_per_manager') || 7)
  const topNScoring = Number(formData.get('top_n_scoring') || 5)
  const enableScraps = formData.get('enable_scraps') === 'true'
  const draftOrderMode = (formData.get('draft_order_mode') as string) || 'random'
  const coursePar = Number(formData.get('course_par') || 72)
  const missedCutScore = Number(formData.get('missed_cut_score') || 80)
  const memberIds = formData.getAll('member_ids') as string[]

  if (!name) throw new Error('Tournament name is required')
  if (golfersPerManager < 1 || golfersPerManager > 20) throw new Error('Invalid golfers per manager')
  if (topNScoring < 1 || topNScoring > golfersPerManager) throw new Error('Top N must be between 1 and golfers per manager')

  const admin = createAdminClient()

  // Create the tournament
  const { data: tournament, error: tErr } = await admin
    .from('pga_tournaments')
    .insert({
      pool_id: poolId,
      espn_event_id: espnEventId,
      name,
      season_year: seasonYear,
      start_date: startDate,
      end_date: endDate,
      golfers_per_manager: golfersPerManager,
      top_n_scoring: topNScoring,
      enable_scraps: enableScraps,
      draft_order_mode: draftOrderMode,
      course_par: coursePar,
      missed_cut_score: missedCutScore,
    })
    .select()
    .single()

  if (tErr || !tournament) throw new Error(tErr?.message || 'Failed to create tournament')

  // Add selected members (or all pool members if none specified)
  const allMembers = await getPoolMembers(poolId)
  const selectedIds = memberIds.length > 0 ? memberIds : allMembers.map((m) => m.id)

  const memberInserts = selectedIds
    .filter((id) => allMembers.some((m) => m.id === id))
    .map((poolMemberId) => ({
      tournament_id: tournament.id,
      pool_member_id: poolMemberId,
    }))

  if (memberInserts.length > 0) {
    const { error: mErr } = await admin
      .from('pga_tournament_members')
      .insert(memberInserts)
    if (mErr) throw new Error(mErr.message)
  }

  // If ESPN event ID is provided, fetch and cache the golfer field
  if (espnEventId) {
    try {
      const { fetchAndCacheGolfers } = await import('@/lib/data-refresh')
      await fetchAndCacheGolfers(admin, tournament.id, espnEventId)
    } catch {
      // Non-fatal: golfers are fetched on next page view via ensureFreshGolfers
    }
  }

  revalidatePath(`/pools/${poolId}/tournaments`)
  redirect(`/pools/${poolId}/tournaments/${tournament.id}`)
}

export async function deleteTournament(
  tournamentId: string,
  poolId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const pool = await getPool(poolId)
  if (!pool || pool.admin_id !== user.id) return { error: 'Only the league admin can delete tournaments' }

  const admin = createAdminClient()
  const { error } = await admin.from('pga_tournaments').delete().eq('id', tournamentId)
  if (error) return { error: error.message }

  revalidatePath(`/pools/${poolId}/tournaments`)
  return {}
}

// ============================================================
// Draft actions
// ============================================================

export async function startPgaDraft(tournamentId: string, poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const pool = await getPool(poolId)
  if (!pool || pool.admin_id !== user.id) throw new Error('Only the league admin can start the draft')

  const tournament = await getTournament(tournamentId)
  if (!tournament) throw new Error('Tournament not found')
  if (tournament.draft_status !== 'pre_draft') throw new Error('Draft already started')

  const admin = createAdminClient()
  const members = await getTournamentMembers(tournamentId)
  if (members.length < 2) throw new Error('Need at least 2 participants')

  // Assign draft positions if random mode
  if (tournament.draft_order_mode === 'random') {
    const shuffled = [...members].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await admin
        .from('pga_tournament_members')
        .update({ draft_position: i + 1 })
        .eq('id', shuffled[i].id)
    }
  }

  const { data: firstMember } = await admin
    .from('pga_tournament_members')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('draft_position', 1)
    .single()

  // Create draft state
  await admin.from('pga_draft_state').insert({
    tournament_id: tournamentId,
    current_round: 1,
    current_pick_number: 1,
    current_member_id: firstMember?.id ?? null,
  })

  // Update tournament status
  await admin
    .from('pga_tournaments')
    .update({ draft_status: 'in_progress' })
    .eq('id', tournamentId)

  return { success: true }
}

export async function makePgaPick(
  tournamentId: string,
  poolId: string,
  golferId: string,
  golferName: string,
  onBehalfOfMemberId?: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  const [tournament, pool] = await Promise.all([
    getTournament(tournamentId),
    getPool(poolId),
  ])

  if (!tournament || !pool) throw new Error('Tournament or pool not found')
  if (tournament.draft_status !== 'in_progress') throw new Error('Draft is not in progress')

  const { data: stateData } = await admin
    .from('pga_draft_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single()
  const state = stateData as PgaDraftState | null
  if (!state) throw new Error('Draft state not found')

  // Find the caller's tournament membership
  const members = await getTournamentMembers(tournamentId)
  const callerPoolMember = members.find((m) => m.pool_member?.user_id === user.id)
  if (!callerPoolMember) throw new Error('You are not a participant in this tournament')

  // Determine target member
  let targetMember = callerPoolMember
  if (onBehalfOfMemberId && onBehalfOfMemberId !== callerPoolMember.id) {
    if (pool.admin_id !== user.id) throw new Error('Only the league admin can pick on behalf of others')
    const target = members.find((m) => m.id === onBehalfOfMemberId)
    if (!target) throw new Error('Target member not found')
    targetMember = target
  }

  // Validate turn
  if (state.current_member_id !== targetMember.id) {
    throw new Error('It is not your turn to pick')
  }

  // Check golfer not already drafted
  const { data: existingPicks } = await admin
    .from('pga_draft_picks')
    .select('golfer_id')
    .eq('tournament_id', tournamentId)
  const draftedGolferIds = new Set((existingPicks ?? []).map((p: { golfer_id: string }) => p.golfer_id))

  if (draftedGolferIds.has(golferId)) {
    throw new Error('This golfer has already been drafted')
  }

  // Insert the pick
  const { error: pickError } = await admin.from('pga_draft_picks').insert({
    tournament_id: tournamentId,
    member_id: targetMember.id,
    round: state.current_round,
    pick_number: state.current_pick_number,
    golfer_id: golferId,
    golfer_name: golferName,
  })

  if (pickError) throw new Error(pickError.message)

  // Advance draft state
  await advancePgaDraftState(admin, tournament, state, members)

  return { success: true }
}

async function advancePgaDraftState(
  admin: ReturnType<typeof createAdminClient>,
  tournament: { id: string; golfers_per_manager: number; pool_id: string },
  state: PgaDraftState,
  members: PgaTournamentMember[]
) {
  const sortedMembers = [...members].sort(
    (a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99)
  )
  const numRounds = tournament.golfers_per_manager
  const managerCount = sortedMembers.length
  const snakeOrder = generateSnakeOrder({ managerCount, numRounds })
  const totalPicks = snakeOrder.length
  const nextPickNumber = state.current_pick_number + 1

  if (nextPickNumber > totalPicks) {
    // Draft complete
    await admin
      .from('pga_tournaments')
      .update({ draft_status: 'completed' })
      .eq('id', tournament.id)

    await admin.from('pga_draft_state').update({
      current_pick_number: nextPickNumber,
      updated_at: new Date().toISOString(),
    }).eq('tournament_id', tournament.id)

    return
  }

  const nextPick = getPickInfo(snakeOrder, nextPickNumber)!
  const nextMember = sortedMembers.find((m) => m.draft_position === nextPick.managerPosition)

  await admin.from('pga_draft_state').update({
    current_round: nextPick.round,
    current_pick_number: nextPickNumber,
    current_member_id: nextMember?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('tournament_id', tournament.id)
}

export async function undoPgaPick(tournamentId: string, poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const pool = await getPool(poolId)
  if (!pool || pool.admin_id !== user.id) throw new Error('Only the league admin can undo picks')

  const admin = createAdminClient()

  const { data: tournament } = await admin
    .from('pga_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()

  if (!tournament) throw new Error('Tournament not found')

  // Get the last pick
  const { data: lastPick } = await admin
    .from('pga_draft_picks')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('pick_number', { ascending: false })
    .limit(1)
    .single() as { data: PgaDraftPick | null }

  if (!lastPick) throw new Error('No picks to undo')

  // Delete the last pick
  await admin.from('pga_draft_picks').delete().eq('id', lastPick.id)

  // If draft was completed, revert to in_progress
  if (tournament.draft_status === 'completed') {
    await admin.from('pga_tournaments').update({ draft_status: 'in_progress' }).eq('id', tournamentId)
  }

  // Rewind draft state to the undone pick
  const members = await getTournamentMembers(tournamentId)
  const sortedMembers = [...members].sort(
    (a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99)
  )
  const numRounds = tournament.golfers_per_manager
  const snakeOrder = generateSnakeOrder({ managerCount: sortedMembers.length, numRounds })
  const pickInfo = getPickInfo(snakeOrder, lastPick.pick_number)

  if (!pickInfo) throw new Error('Invalid pick number')

  const memberForPick = sortedMembers.find((m) => m.draft_position === pickInfo.managerPosition)

  await admin.from('pga_draft_state').update({
    current_round: pickInfo.round,
    current_pick_number: lastPick.pick_number,
    current_member_id: memberForPick?.id ?? null,
    updated_at: new Date().toISOString(),
  }).eq('tournament_id', tournamentId)

  return { success: true }
}

export async function resetPgaDraft(tournamentId: string, poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const pool = await getPool(poolId)
  if (!pool || pool.admin_id !== user.id) throw new Error('Only the league admin can reset the draft')

  const admin = createAdminClient()

  // Delete all draft data
  await admin.from('pga_draft_picks').delete().eq('tournament_id', tournamentId)
  await admin.from('pga_draft_state').delete().eq('tournament_id', tournamentId)

  // Reset tournament status
  await admin
    .from('pga_tournaments')
    .update({ draft_status: 'pre_draft' })
    .eq('id', tournamentId)

  // Clear draft positions
  await admin
    .from('pga_tournament_members')
    .update({ draft_position: null })
    .eq('tournament_id', tournamentId)

  return { success: true }
}
