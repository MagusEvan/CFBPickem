'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { FfPoolOptions } from './ff-pool-options'
import { updateFfSettings } from '@/lib/ff/actions'
import type { FFLeagueSettings, FFScoringSettings } from '@/lib/ff/types'

export function FfLeagueSettingsCard({
  poolId,
  initialLeague,
  initialScoring,
  rosterLocked,
}: {
  poolId: string
  initialLeague: FFLeagueSettings
  initialScoring: FFScoringSettings
  rosterLocked: boolean
}) {
  const [league, setLeague] = useState(initialLeague)
  const [scoring, setScoring] = useState(initialScoring)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const result = await updateFfSettings(poolId, JSON.stringify(league), JSON.stringify(scoring))
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>League Settings</CardTitle>
        <CardDescription>Draft, season, waiver, trade, roster, and scoring configuration</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}
        {saved && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">Settings saved</div>
        )}
        <FfPoolOptions
          league={league}
          scoring={scoring}
          onLeagueChange={(next) => { setLeague(next); setSaved(false) }}
          onScoringChange={(next) => { setScoring(next); setSaved(false) }}
          rosterLocked={rosterLocked}
        />
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Spinner className="mr-2" />}
          {saving ? 'Saving...' : 'Save League Settings'}
        </Button>
      </CardFooter>
    </Card>
  )
}
