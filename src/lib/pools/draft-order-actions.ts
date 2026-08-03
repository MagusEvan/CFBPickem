'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFfFamily } from '@/lib/games/registry'
import type { Pool, PoolMember } from '@/lib/types'

type Result = { error?: string }

/**
 * Draft order is the admin's to set, and only until picks start. These actions
 * write with the service-role client, so every one of them has to re-check the
 * caller — a server action is reachable by anyone who has its id, not just by
 * whoever the settings page decided to render a form for.
 */
async function authorizePreDraft(
  poolId: string
): Promise<{ error: string } | { pool: Pool; members: PoolMember[] }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const { data: pool } = (await admin
    .from('pools')
    .select('*')
    .eq('id', poolId)
    .single()) as { data: Pool | null }

  if (!pool) return { error: 'Pool not found' }
  if (pool.admin_id !== user.id) {
    return { error: 'Only the pool admin can change the draft order' }
  }
  if (pool.game_type === 'pga') {
    return { error: 'PGA draft order is set per tournament, not per pool' }
  }

  // FF-family pools track draft progress on ff_draft_state; the rest use pools.draft_status
  if (isFfFamily(pool.game_type)) {
    const { data: state } = await admin
      .from('ff_draft_state')
      .select('status')
      .eq('pool_id', poolId)
      .single()
    if (state && state.status !== 'pre_draft') {
      return { error: 'The draft has already started' }
    }
  } else if (pool.draft_status !== 'pre_draft') {
    return { error: 'The draft has already started' }
  }

  const { data: members } = (await admin
    .from('pool_members')
    .select('*')
    .eq('pool_id', poolId)) as { data: PoolMember[] | null }

  return { pool, members: members ?? [] }
}

/** Members in their current draft order, with unseeded members after seeded ones. */
function inCurrentOrder(members: PoolMember[]): PoolMember[] {
  return [...members].sort((a, b) => {
    const aPos = a.draft_position ?? Number.MAX_SAFE_INTEGER
    const bPos = b.draft_position ?? Number.MAX_SAFE_INTEGER
    return aPos - bPos || a.joined_at.localeCompare(b.joined_at)
  })
}

async function writePositions(orderedMemberIds: string[]): Promise<Result> {
  const admin = createAdminClient()
  for (let i = 0; i < orderedMemberIds.length; i++) {
    const { error } = await admin
      .from('pool_members')
      .update({ draft_position: i + 1 })
      .eq('id', orderedMemberIds[i])
    if (error) return { error: error.message }
  }
  return {}
}

export async function setDraftOrderMode(
  poolId: string,
  mode: 'random' | 'manual'
): Promise<Result> {
  if (mode !== 'random' && mode !== 'manual') return { error: 'Invalid draft order mode' }

  const auth = await authorizePreDraft(poolId)
  if ('error' in auth) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('pools')
    .update({ draft_order_mode: mode })
    .eq('id', poolId)
  if (error) return { error: error.message }

  if (mode === 'manual') {
    // Seed 1..N immediately so manual mode always has a complete, valid order
    // even if the admin never touches the list — a gap or a duplicate would
    // leave the draft unable to resolve whose turn it is.
    const seeded = await writePositions(inCurrentOrder(auth.members).map((m) => m.id))
    if (seeded.error) return seeded
  } else {
    // Random reshuffles at startDraft; clearing avoids showing a stale order
    await admin.from('pool_members').update({ draft_position: null }).eq('pool_id', poolId)
  }

  return {}
}

export async function saveDraftOrder(
  poolId: string,
  orderedMemberIds: string[]
): Promise<Result> {
  const auth = await authorizePreDraft(poolId)
  if ('error' in auth) return auth

  // The submitted list has to be exactly this pool's members, once each. A
  // member who joined or left since the page rendered would otherwise end up
  // unpositioned or duplicated.
  const memberIds = new Set(auth.members.map((m) => m.id))
  const isCompletePermutation =
    orderedMemberIds.length === memberIds.size &&
    new Set(orderedMemberIds).size === orderedMemberIds.length &&
    orderedMemberIds.every((id) => memberIds.has(id))

  if (!isCompletePermutation) {
    return { error: 'The manager list changed — reload the page and set the order again.' }
  }

  const written = await writePositions(orderedMemberIds)
  if (written.error) return written

  // Saving a hand-picked order implies manual mode; otherwise startDraft would
  // shuffle it away.
  const { error } = await createAdminClient()
    .from('pools')
    .update({ draft_order_mode: 'manual' })
    .eq('id', poolId)
  if (error) return { error: error.message }

  return {}
}
