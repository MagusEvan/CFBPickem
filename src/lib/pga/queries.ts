import { createClient } from '@/lib/supabase/server'
import type { PgaTournament, PgaTournamentMember, PgaGolfer, PgaDraftPick, PgaDraftState, PoolMember, Profile } from '@/lib/types'

export async function getTournament(tournamentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('pga_tournaments')
    .select('*')
    .eq('id', tournamentId)
    .single()
  if (error) return null
  return data as PgaTournament
}

export async function getTournaments(poolId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pga_tournaments')
    .select('*')
    .eq('pool_id', poolId)
    .order('created_at', { ascending: false })
  return (data ?? []) as PgaTournament[]
}

export async function getTournamentMembers(tournamentId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pga_tournament_members')
    .select('*, pool_members:pool_member_id(*, profiles(*))')
    .eq('tournament_id', tournamentId)
    .order('draft_position', { ascending: true, nullsFirst: false })

  // Reshape the joined data
  return (data ?? []).map((row) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (row as any).pool_members as PoolMember & { profiles: Profile }
    return {
      id: row.id,
      tournament_id: row.tournament_id,
      pool_member_id: row.pool_member_id,
      draft_position: row.draft_position,
      pool_member: pm,
    } as PgaTournamentMember
  })
}

export async function getTournamentGolfers(tournamentId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pga_golfers')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('position', { ascending: true })
  return (data ?? []) as PgaGolfer[]
}

export async function getTournamentPicks(tournamentId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pga_draft_picks')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('pick_number', { ascending: true })
  return (data ?? []) as PgaDraftPick[]
}

export async function getTournamentDraftState(tournamentId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pga_draft_state')
    .select('*')
    .eq('tournament_id', tournamentId)
    .single()
  return data as PgaDraftState | null
}
