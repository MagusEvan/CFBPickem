'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nanoid } from 'nanoid'
import { redirect } from 'next/navigation'
import { z } from 'zod'

const DEFAULT_CONFERENCES = [
  'ACC', 'B12', 'B1G', 'SEC', 'AAC', 'CUSA', 'MAC', 'MW', 'SBC', 'PAC12_IND'
]

const TOTAL_WC_TEAMS = 48

const wcScoringConfigSchema = z.object({
  group: z.object({
    win: z.number(), draw: z.number(), goal_points: z.number(),
    goal_cap: z.number(), shutout: z.number(),
  }),
  knockout: z.object({
    win: z.number(), ot_win: z.number(), shootout_win: z.number(),
    shootout_loss: z.number(), ot_loss: z.number(), loss: z.number(),
    goal_points: z.number(), goal_cap: z.number().nullable(), shutout: z.number(),
  }),
})

const createCfbPoolSchema = z.object({
  game_type: z.literal('cfb'),
  name: z.string().min(1).max(100),
  season_year: z.number().int().min(2024).max(2030),
  max_managers: z.number().int().min(4).max(16),
  conferences: z.array(z.string()).min(1).max(15),
  draft_order_mode: z.enum(['manual', 'random']),
})

const createWcPoolSchema = z.object({
  game_type: z.literal('world_cup'),
  name: z.string().min(1).max(100),
  season_year: z.number().int().min(2024).max(2030),
  max_managers: z.number().int().min(2).max(48),
  teams_per_manager: z.number().int().min(1),
  scoring_config: wcScoringConfigSchema,
  draft_order_mode: z.enum(['manual', 'random']),
}).refine(
  (d) => d.max_managers * d.teams_per_manager <= TOTAL_WC_TEAMS,
  { message: `Managers × teams per manager must not exceed ${TOTAL_WC_TEAMS}` }
)

export async function createPool(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const gameType = formData.get('game_type') || 'cfb'
  const inviteCode = nanoid(8)

  let poolInsert: Record<string, unknown>

  if (gameType === 'world_cup') {
    const input = createWcPoolSchema.parse({
      game_type: 'world_cup',
      name: formData.get('name'),
      season_year: Number(formData.get('season_year')),
      max_managers: Number(formData.get('max_managers')),
      teams_per_manager: Number(formData.get('teams_per_manager')),
      scoring_config: JSON.parse(formData.get('scoring_config') as string),
      draft_order_mode: formData.get('draft_order_mode') || 'random',
    })

    poolInsert = {
      name: input.name,
      admin_id: user.id,
      season_year: input.season_year,
      invite_code: inviteCode,
      max_managers: input.max_managers,
      game_type: 'world_cup',
      conferences: null,
      num_rounds: input.teams_per_manager,
      teams_per_manager: input.teams_per_manager,
      scoring_config: input.scoring_config,
      scoring_strategy: 'world_cup',
      draft_order_mode: input.draft_order_mode,
    }
  } else {
    const input = createCfbPoolSchema.parse({
      game_type: 'cfb',
      name: formData.get('name'),
      season_year: Number(formData.get('season_year')),
      max_managers: Number(formData.get('max_managers')),
      conferences: formData.getAll('conferences'),
      draft_order_mode: formData.get('draft_order_mode') || 'random',
    })

    poolInsert = {
      name: input.name,
      admin_id: user.id,
      season_year: input.season_year,
      invite_code: inviteCode,
      max_managers: input.max_managers,
      game_type: 'cfb',
      conferences: input.conferences,
      num_rounds: input.conferences.length,
      draft_order_mode: input.draft_order_mode,
    }
  }

  const { data: pool, error } = await supabase
    .from('pools')
    .insert(poolInsert)
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Auto-join the admin as the first member
  await supabase.from('pool_members').insert({
    pool_id: pool.id,
    user_id: user.id,
    draft_position: 1,
  })

  redirect(`/pools/${pool.id}`)
}

export async function joinPool(inviteCode: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Use admin client to bypass RLS — user isn't a member yet
  const admin = createAdminClient()
  const { data: pool, error: poolError } = await admin
    .from('pools')
    .select('id, max_managers, draft_status')
    .eq('invite_code', inviteCode)
    .single()

  if (poolError || !pool) throw new Error('Invalid invite code')
  if (pool.draft_status !== 'pre_draft') throw new Error('This pool has already started drafting')

  // Check if already a member
  const { data: existing } = await supabase
    .from('pool_members')
    .select('id')
    .eq('pool_id', pool.id)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    redirect(`/pools/${pool.id}`)
  }

  // Check member count
  const { count } = await supabase
    .from('pool_members')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', pool.id)

  if ((count ?? 0) >= pool.max_managers) throw new Error('This pool is full')

  // Join
  const { error } = await supabase.from('pool_members').insert({
    pool_id: pool.id,
    user_id: user.id,
  })

  if (error) throw new Error(error.message)

  redirect(`/pools/${pool.id}`)
}

export async function getDefaultConferences() {
  return DEFAULT_CONFERENCES
}
