'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { BestBallPoolOptions } from './bestball-pool-options'
import { updateBestBallSettings } from '@/lib/ff/actions'
import type { FFBestBallSettings, FFScoringSettings } from '@/lib/ff/types'

export function BestBallSettingsCard({
  poolId,
  initialSettings,
  initialScoring,
  structureLocked,
}: {
  poolId: string
  initialSettings: FFBestBallSettings
  initialScoring: FFScoringSettings
  structureLocked: boolean
}) {
  const [settings, setSettings] = useState(initialSettings)
  const [scoring, setScoring] = useState(initialScoring)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const result = await updateBestBallSettings(
      poolId,
      JSON.stringify(settings),
      JSON.stringify(scoring)
    )
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
        <CardDescription>Format, draft, roster, and scoring configuration</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        )}
        {saved && (
          <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">Settings saved</div>
        )}
        <BestBallPoolOptions
          settings={settings}
          scoring={scoring}
          onSettingsChange={(next) => { setSettings(next); setSaved(false) }}
          onScoringChange={(next) => { setScoring(next); setSaved(false) }}
          structureLocked={structureLocked}
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
