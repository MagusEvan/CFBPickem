'use client'

import { useState } from 'react'
import { createPool } from '@/lib/pools/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import type { WorldCupScoringConfig } from '@/lib/types'

const ALL_CONFERENCES = [
  { key: 'ACC', name: 'ACC' },
  { key: 'B12', name: 'Big 12' },
  { key: 'B1G', name: 'Big Ten' },
  { key: 'SEC', name: 'SEC' },
  { key: 'AAC', name: 'American Athletic' },
  { key: 'CUSA', name: 'Conference USA' },
  { key: 'MAC', name: 'MAC' },
  { key: 'MW', name: 'Mountain West' },
  { key: 'SBC', name: 'Sun Belt' },
  { key: 'PAC12_IND', name: 'Pac-12 / Independent' },
]

const DEFAULT_SELECTED = ALL_CONFERENCES.map((c) => c.key)

const TOTAL_WC_TEAMS = 48

const DEFAULT_WC_SCORING: WorldCupScoringConfig = {
  group: { win: 6, draw: 3, goal_points: 1, goal_cap: 3, shutout: 1 },
  knockout: {
    win: 6, ot_win: 5, shootout_win: 4, shootout_loss: 2,
    ot_loss: 1, loss: 0, goal_points: 1, goal_cap: null, shutout: 1,
  },
}

export default function CreatePoolPage() {
  const [gameType, setGameType] = useState<'cfb' | 'world_cup'>('cfb')
  const [selectedConferences, setSelectedConferences] = useState<string[]>(DEFAULT_SELECTED)
  const [maxManagers, setMaxManagers] = useState(10)
  const [teamsPerManager, setTeamsPerManager] = useState(4)
  const [scoringConfig, setScoringConfig] = useState<WorldCupScoringConfig>(DEFAULT_WC_SCORING)
  const [showScoring, setShowScoring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleConference(key: string) {
    setSelectedConferences((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const wcTeamOverflow = gameType === 'world_cup' && maxManagers * teamsPerManager > TOTAL_WC_TEAMS

  function updateGroupScoring(field: keyof WorldCupScoringConfig['group'], value: number) {
    setScoringConfig((prev) => ({ ...prev, group: { ...prev.group, [field]: value } }))
  }

  function updateKnockoutScoring(field: keyof WorldCupScoringConfig['knockout'], value: number | null) {
    setScoringConfig((prev) => ({ ...prev, knockout: { ...prev.knockout, [field]: value } }))
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      formData.set('game_type', gameType)
      if (gameType === 'cfb') {
        selectedConferences.forEach((key) => formData.append('conferences', key))
      } else {
        formData.set('teams_per_manager', String(teamsPerManager))
        formData.set('scoring_config', JSON.stringify(scoringConfig))
      }
      await createPool(formData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  const isValid = gameType === 'cfb'
    ? selectedConferences.length > 0
    : !wcTeamOverflow && teamsPerManager >= 1

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Create a Pool</CardTitle>
          <CardDescription>Set up your draft pool and invite managers</CardDescription>
        </CardHeader>
        <form action={handleSubmit}>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            {/* Game Type Selector */}
            <div className="space-y-2">
              <Label>Game Type</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGameType('cfb')}
                  className={`rounded-md border p-3 text-sm font-medium transition-colors ${
                    gameType === 'cfb'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  College Football
                </button>
                <button
                  type="button"
                  onClick={() => setGameType('world_cup')}
                  className={`rounded-md border p-3 text-sm font-medium transition-colors ${
                    gameType === 'world_cup'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  World Cup
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input
                id="name"
                name="name"
                placeholder={gameType === 'cfb' ? 'e.g. The Gridiron League' : 'e.g. World Cup 2026 Draft'}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="season_year">
                  {gameType === 'cfb' ? 'Season Year' : 'Tournament Year'}
                </Label>
                <Input
                  id="season_year"
                  name="season_year"
                  type="number"
                  defaultValue={gameType === 'cfb' ? new Date().getFullYear() : 2026}
                  key={gameType} // reset when game type changes
                  min={2024}
                  max={2030}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_managers">Max Managers</Label>
                <Input
                  id="max_managers"
                  name="max_managers"
                  type="number"
                  value={maxManagers}
                  onChange={(e) => setMaxManagers(Number(e.target.value))}
                  min={2}
                  max={gameType === 'cfb' ? 16 : 48}
                />
              </div>
            </div>

            {/* World Cup: Teams per Manager */}
            {gameType === 'world_cup' && (
              <div className="space-y-2">
                <Label htmlFor="teams_per_manager">Teams per Manager</Label>
                <Input
                  id="teams_per_manager"
                  type="number"
                  value={teamsPerManager}
                  onChange={(e) => setTeamsPerManager(Number(e.target.value))}
                  min={1}
                  max={Math.floor(TOTAL_WC_TEAMS / Math.max(maxManagers, 1))}
                />
                <p className="text-xs text-muted-foreground">
                  {maxManagers} managers × {teamsPerManager} teams = {maxManagers * teamsPerManager} of {TOTAL_WC_TEAMS} teams
                </p>
                {wcTeamOverflow && (
                  <p className="text-xs text-red-600">
                    Too many teams — reduce managers or teams per manager.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Draft Order</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="radio" name="draft_order_mode" value="random" defaultChecked />
                  <span className="text-sm">Random</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="draft_order_mode" value="manual" />
                  <span className="text-sm">Manual</span>
                </label>
              </div>
            </div>

            {/* CFB: Conference Selection */}
            {gameType === 'cfb' && (
              <div className="space-y-2">
                <Label>Conferences ({selectedConferences.length} selected)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_CONFERENCES.map((conf) => (
                    <label
                      key={conf.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors ${
                        selectedConferences.includes(conf.key)
                          ? 'border-primary bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedConferences.includes(conf.key)}
                        onChange={() => toggleConference(conf.key)}
                        className="accent-primary"
                      />
                      {conf.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* World Cup: Scoring Settings */}
            {gameType === 'world_cup' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowScoring(!showScoring)}
                  className="flex w-full items-center justify-between text-sm font-medium"
                >
                  <span className="text-sm font-medium">Scoring Settings</span>
                  <span className="text-xs text-muted-foreground">
                    {showScoring ? 'Hide' : 'Customize'}
                  </span>
                </button>

                {showScoring && (
                  <div className="space-y-4 rounded-md border p-4">
                    {/* Group Stage */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Group Stage</p>
                      <div className="grid grid-cols-2 gap-3">
                        <ScoringField label="Win" value={scoringConfig.group.win}
                          onChange={(v) => updateGroupScoring('win', v)} />
                        <ScoringField label="Draw" value={scoringConfig.group.draw}
                          onChange={(v) => updateGroupScoring('draw', v)} />
                        <ScoringField label="Points per goal" value={scoringConfig.group.goal_points}
                          onChange={(v) => updateGroupScoring('goal_points', v)} />
                        <ScoringField label="Goal cap" value={scoringConfig.group.goal_cap}
                          onChange={(v) => updateGroupScoring('goal_cap', v)} />
                        <ScoringField label="Shutout" value={scoringConfig.group.shutout}
                          onChange={(v) => updateGroupScoring('shutout', v)} />
                      </div>
                    </div>

                    {/* Knockout Rounds */}
                    <div className="space-y-2">
                      <p className="text-sm font-semibold">Knockout Rounds</p>
                      <div className="grid grid-cols-2 gap-3">
                        <ScoringField label="Outright win" value={scoringConfig.knockout.win}
                          onChange={(v) => updateKnockoutScoring('win', v)} />
                        <ScoringField label="OT win" value={scoringConfig.knockout.ot_win}
                          onChange={(v) => updateKnockoutScoring('ot_win', v)} />
                        <ScoringField label="Shootout win" value={scoringConfig.knockout.shootout_win}
                          onChange={(v) => updateKnockoutScoring('shootout_win', v)} />
                        <ScoringField label="Shootout loss" value={scoringConfig.knockout.shootout_loss}
                          onChange={(v) => updateKnockoutScoring('shootout_loss', v)} />
                        <ScoringField label="OT loss" value={scoringConfig.knockout.ot_loss}
                          onChange={(v) => updateKnockoutScoring('ot_loss', v)} />
                        <ScoringField label="Outright loss" value={scoringConfig.knockout.loss}
                          onChange={(v) => updateKnockoutScoring('loss', v)} />
                        <ScoringField label="Points per goal" value={scoringConfig.knockout.goal_points}
                          onChange={(v) => updateKnockoutScoring('goal_points', v)} />
                        <ScoringField label="Shutout" value={scoringConfig.knockout.shutout}
                          onChange={(v) => updateKnockoutScoring('shutout', v)} />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setScoringConfig(DEFAULT_WC_SCORING)}
                      className="text-xs text-muted-foreground underline underline-offset-2"
                    >
                      Reset to defaults
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading || !isValid}>
              {loading && <Spinner className="mr-2" />}
              {loading ? 'Creating...' : 'Create Pool'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

function ScoringField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
        max={20}
        className="h-8 text-sm"
      />
    </div>
  )
}
