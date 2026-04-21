'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateSnakeOrder, getPickInfo, validatePick, checkPac12Depletion, calculateTeamScraps } from './engine'
import type { Pool, PoolMember, DraftPick, DraftState, CachedTeam } from '@/lib/types'

export async function startDraft(poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single() as { data: Pool | null }

  if (!pool) throw new Error('Pool not found')
  if (pool.admin_id !== user.id) throw new Error('Only the admin can start the draft')
  if (pool.draft_status !== 'pre_draft') throw new Error('Draft already started')

  const admin = createAdminClient()

  const { data: members } = await admin
    .from('pool_members')
    .select('*')
    .eq('pool_id', poolId) as { data: PoolMember[] | null }

  if (!members || members.length < 2) throw new Error('Need at least 2 managers')

  // Assign draft positions if random mode
  if (pool.draft_order_mode === 'random') {
    const shuffled = [...members].sort(() => Math.random() - 0.5)
    for (let i = 0; i < shuffled.length; i++) {
      await admin
        .from('pool_members')
        .update({ draft_position: i + 1 })
        .eq('id', shuffled[i].id)
    }
  }

  const { data: firstMember } = await admin
    .from('pool_members')
    .select('id')
    .eq('pool_id', poolId)
    .eq('draft_position', 1)
    .single()

  // Create draft state
  await admin.from('draft_state').insert({
    pool_id: poolId,
    current_round: 1,
    current_pick_number: 1,
    current_member_id: firstMember?.id ?? null,
    conference_key: null,
    pac12_ind_depleted: false,
  })

  await admin
    .from('pools')
    .update({ draft_status: 'in_progress' })
    .eq('id', poolId)

  return { success: true }
}

export async function resetDraft(poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single() as { data: Pool | null }

  if (!pool) throw new Error('Pool not found')
  if (pool.admin_id !== user.id) throw new Error('Only the admin can reset the draft')

  const admin = createAdminClient()

  // Delete all draft data
  await admin.from('team_scraps').delete().eq('pool_id', poolId)
  await admin.from('draft_picks').delete().eq('pool_id', poolId)
  await admin.from('draft_state').delete().eq('pool_id', poolId)

  // Reset pool status
  await admin
    .from('pools')
    .update({ draft_status: 'pre_draft' })
    .eq('id', poolId)

  // Clear draft positions
  await admin
    .from('pool_members')
    .update({ draft_position: null })
    .eq('pool_id', poolId)

  return { success: true }
}

export async function undoPick(poolId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single() as { data: Pool | null }

  if (!pool) throw new Error('Pool not found')
  if (pool.admin_id !== user.id) throw new Error('Only the admin can undo picks')

  const admin = createAdminClient()

  // Get the last pick
  const { data: lastPick } = await admin
    .from('draft_picks')
    .select('*')
    .eq('pool_id', poolId)
    .order('pick_number', { ascending: false })
    .limit(1)
    .single() as { data: DraftPick | null }

  if (!lastPick) throw new Error('No picks to undo')

  // Delete the last pick
  await admin.from('draft_picks').delete().eq('id', lastPick.id)

  // If draft was completed, set it back to in_progress and delete team scraps
  if (pool.draft_status === 'completed') {
    await admin.from('pools').update({ draft_status: 'in_progress' }).eq('id', poolId)
    await admin.from('team_scraps').delete().eq('pool_id', poolId)
  }

  // Rewind draft state to the undone pick
  const conferences = pool.conferences as string[]
  const { data: members } = await admin
    .from('pool_members')
    .select('*')
    .eq('pool_id', poolId)
    .order('draft_position', { ascending: true }) as { data: PoolMember[] | null }

  if (!members) throw new Error('No members found')

  const snakeOrder = generateSnakeOrder({ managerCount: members.length, numRounds: conferences.length })
  const pickInfo = getPickInfo(snakeOrder, lastPick.pick_number)

  if (!pickInfo) throw new Error('Invalid pick number')

  const memberForPick = members.find((m) => m.draft_position === pickInfo.managerPosition)

  // Check pac12 depletion status after removing the pick
  let pac12Depleted = false
  if (conferences.includes('PAC12_IND')) {
    const { data: pac12Teams } = await admin
      .from('cached_teams')
      .select('id')
      .eq('conference_key', 'PAC12_IND')
      .eq('season_year', pool.season_year)

    const { data: pac12Picks } = await admin
      .from('draft_picks')
      .select('id')
      .eq('pool_id', poolId)
      .eq('conference_key', 'PAC12_IND')
      .eq('is_bonus_pick', false)

    pac12Depleted = checkPac12Depletion(
      pac12Teams?.length ?? 0,
      pac12Picks?.length ?? 0
    )
  }

  await admin.from('draft_state').update({
    current_round: pickInfo.round,
    current_pick_number: lastPick.pick_number,
    current_member_id: memberForPick?.id ?? null,
    conference_key: null,
    pac12_ind_depleted: pac12Depleted,
    updated_at: new Date().toISOString(),
  }).eq('pool_id', poolId)

  return { success: true }
}

export async function makePick(
  poolId: string,
  teamId: string,
  teamName: string,
  teamConferenceKey: string,
  chosenConferenceKey: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()

  const [poolRes, stateRes, memberRes] = await Promise.all([
    admin.from('pools').select('*').eq('id', poolId).single(),
    admin.from('draft_state').select('*').eq('pool_id', poolId).single(),
    admin.from('pool_members').select('*').eq('pool_id', poolId).eq('user_id', user.id).single(),
  ])

  const pool = poolRes.data as Pool | null
  const state = stateRes.data as DraftState | null
  const member = memberRes.data as PoolMember | null

  if (!pool || !state || !member) throw new Error('Draft data not found')
  if (pool.draft_status !== 'in_progress') throw new Error('Draft is not in progress')

  // Get all existing picks
  const { data: existingPicks } = await admin
    .from('draft_picks')
    .select('*')
    .eq('pool_id', poolId) as { data: DraftPick[] | null }

  const draftedTeamIds = new Set((existingPicks ?? []).map((p) => p.team_id))

  // Get this member's drafted conferences and bonus pick status
  const memberPicks = (existingPicks ?? []).filter((p) => p.member_id === member.id)
  const memberConferences = new Set(memberPicks.map((p) => p.conference_key))
  const memberHasBonusPick = memberPicks.some((p) => p.is_bonus_pick)

  const conferences = pool.conferences as string[]

  // Validate pick
  const validation = validatePick({
    teamId,
    teamConferenceKey,
    chosenConferenceKey,
    currentPickMemberId: state.current_member_id!,
    requestingMemberId: member.id,
    draftedTeamIds,
    memberConferences,
    memberHasBonusPick,
    pac12IndDepleted: state.pac12_ind_depleted,
    poolConferences: conferences,
  })

  if (!validation.valid) throw new Error(validation.error)

  // Determine if this is a bonus pick
  const isBonusPick = state.pac12_ind_depleted &&
    !memberConferences.has('PAC12_IND') &&
    memberConferences.has(chosenConferenceKey)

  // Insert pick
  const { error: pickError } = await admin.from('draft_picks').insert({
    pool_id: poolId,
    member_id: member.id,
    round: state.current_round,
    pick_number: state.current_pick_number,
    conference_key: chosenConferenceKey,
    team_id: teamId,
    team_name: teamName,
    is_bonus_pick: isBonusPick,
    bonus_conference_key: isBonusPick ? chosenConferenceKey : null,
  })

  if (pickError) throw new Error(pickError.message)

  // Advance draft state
  await advanceDraftState(admin, pool, state, poolId)

  return { success: true }
}

async function advanceDraftState(
  admin: ReturnType<typeof createAdminClient>,
  pool: Pool,
  state: DraftState,
  poolId: string
) {
  const { data: members } = await admin
    .from('pool_members')
    .select('*')
    .eq('pool_id', poolId)
    .order('draft_position', { ascending: true }) as { data: PoolMember[] | null }

  if (!members) return

  const conferences = pool.conferences as string[]
  const managerCount = members.length
  const snakeOrder = generateSnakeOrder({ managerCount, numRounds: conferences.length })
  const totalPicks = snakeOrder.length
  const nextPickNumber = state.current_pick_number + 1

  if (nextPickNumber > totalPicks) {
    // Draft complete
    await admin.from('pools').update({ draft_status: 'completed' }).eq('id', poolId)
    await admin.from('draft_state').update({
      current_pick_number: nextPickNumber,
      updated_at: new Date().toISOString(),
    }).eq('pool_id', poolId)

    await finalizeTeamScraps(admin, poolId, pool)
    return
  }

  const nextPick = getPickInfo(snakeOrder, nextPickNumber)!
  const nextMember = members.find((m) => m.draft_position === nextPick.managerPosition)

  // Check Pac-12 depletion
  let pac12Depleted = state.pac12_ind_depleted
  if (conferences.includes('PAC12_IND') && !pac12Depleted) {
    const { data: pac12Teams } = await admin
      .from('cached_teams')
      .select('id')
      .eq('conference_key', 'PAC12_IND')
      .eq('season_year', pool.season_year)

    const { data: pac12Picks } = await admin
      .from('draft_picks')
      .select('id')
      .eq('pool_id', poolId)
      .eq('conference_key', 'PAC12_IND')
      .eq('is_bonus_pick', false)

    pac12Depleted = checkPac12Depletion(
      pac12Teams?.length ?? 0,
      pac12Picks?.length ?? 0
    )
  }

  await admin.from('draft_state').update({
    current_round: nextPick.round,
    current_pick_number: nextPickNumber,
    current_member_id: nextMember?.id ?? null,
    conference_key: null,
    pac12_ind_depleted: pac12Depleted,
    updated_at: new Date().toISOString(),
  }).eq('pool_id', poolId)
}

async function finalizeTeamScraps(
  admin: ReturnType<typeof createAdminClient>,
  poolId: string,
  pool: Pool
) {
  const [teamsRes, picksRes] = await Promise.all([
    admin.from('cached_teams').select('*').eq('season_year', pool.season_year),
    admin.from('draft_picks').select('team_id').eq('pool_id', poolId),
  ])

  const allTeams = (teamsRes.data ?? []) as CachedTeam[]
  const draftedTeamIds = new Set((picksRes.data ?? []).map((p: { team_id: string }) => p.team_id))
  const conferences = pool.conferences as string[]

  const scraps = calculateTeamScraps(allTeams, draftedTeamIds, conferences)

  const rows = scraps.map((s) => ({
    pool_id: poolId,
    conference_key: s.conferenceKey,
    team_id: s.team.id,
    team_name: s.team.name,
    wins: s.team.wins,
  }))

  if (rows.length > 0) {
    await admin.from('team_scraps').upsert(rows, { onConflict: 'pool_id,conference_key' })
  }
}
