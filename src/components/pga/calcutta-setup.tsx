'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { CalcuttaSettings } from '@/lib/pga/calcutta-types'
import { validateCalcuttaSettings } from '@/lib/pga/calcutta-types'
import type { PgaCalcuttaLot } from '@/lib/types'
import {
  updateCalcuttaSettings,
  updateGolferOdds,
  seedCalcuttaOddsFromApi,
  regenerateCalcuttaLots,
  reorderCalcuttaLots,
  assignScrapsGolfer,
  startCalcuttaAuction,
} from '@/lib/pga/calcutta-actions'

interface GolferRow {
  id: string
  name: string
  calcutta_odds: number | null
  odds_source: string | null
}

export function CalcuttaSetup({
  tournamentId,
  poolId,
  initialSettings,
  golfers,
  lots,
}: {
  tournamentId: string
  poolId: string
  initialSettings: CalcuttaSettings
  golfers: GolferRow[]
  lots: PgaCalcuttaLot[]
}) {
  const router = useRouter()
  const [settings, setSettings] = useState<CalcuttaSettings>(initialSettings)
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  const settingsError = validateCalcuttaSettings(settings)
  const tierTotal = settings.payoutTiers.reduce((s, t) => s + t.pct, 0)
  const golferById = new Map(golfers.map((g) => [g.id, g]))

  function run(fn: () => Promise<{ error?: string }>, successText?: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await fn()
      if (result.error) {
        setMessage({ text: result.error, isError: true })
      } else {
        if (successText) setMessage({ text: successText, isError: false })
        router.refresh()
      }
    })
  }

  function setScraps(patch: Partial<CalcuttaSettings['scraps']>) {
    setSettings((s) => ({ ...s, scraps: { ...s.scraps, ...patch } }))
  }

  function setTier(idx: number, patch: Partial<{ position: number; pct: number }>) {
    setSettings((s) => ({
      ...s,
      payoutTiers: s.payoutTiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)),
    }))
  }

  function moveLot(idx: number, dir: -1 | 1) {
    const ids = lots.map((l) => l.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    run(() => reorderCalcuttaLots(tournamentId, poolId, ids))
  }

  const scrapsEligible = settings.scraps.enabled
    ? golfers.filter(
        (g) => g.calcutta_odds === null || g.calcutta_odds > settings.scraps.thresholdOdds
      )
    : []
  const scrapsLots = lots.filter((l) => l.kind === 'scraps')
  const assignedLotByGolfer = new Map<string, string>()
  for (const lot of scrapsLots) for (const id of lot.golfer_ids) assignedLotByGolfer.set(id, lot.id)

  return (
    <div className="space-y-4">
      {/* ---- Auction settings ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Calcutta Auction Settings</CardTitle>
          <CardDescription>
            Golfers are auctioned in reverse odds order — longshots first, the favorite last.
            Settings lock once the auction starts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="calcutta_mode"
                checked={settings.mode === 'live'}
                onChange={() => setSettings((s) => ({ ...s, mode: 'live' }))}
              />
              <span className="text-sm">Live in-app bidding</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="calcutta_mode"
                checked={settings.mode === 'admin_entry'}
                onChange={() => setSettings((s) => ({ ...s, mode: 'admin_entry' }))}
              />
              <span className="text-sm">Admin entry (in-person auction)</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Min opening bid ($)</Label>
              <Input
                type="number"
                min={0}
                value={settings.minOpeningBid}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, minOpeningBid: Number(e.target.value) }))
                }
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-xs">Min raise ($)</Label>
              <Input
                type="number"
                min={1}
                value={settings.minRaise}
                onChange={(e) => setSettings((s) => ({ ...s, minRaise: Number(e.target.value) }))}
                className="h-8"
              />
            </div>
            {settings.mode === 'live' && (
              <div>
                <Label className="text-xs">Bid timer (seconds)</Label>
                <Input
                  type="number"
                  min={5}
                  max={300}
                  value={settings.timerSeconds}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, timerSeconds: Number(e.target.value) }))
                  }
                  className="h-8"
                />
              </div>
            )}
          </div>

          {/* Scraps */}
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.scraps.enabled}
                onChange={(e) => setScraps({ enabled: e.target.checked })}
              />
              <span className="text-sm font-medium">Scraps packages</span>
            </label>
            {settings.scraps.enabled && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Odds threshold (+)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={settings.scraps.thresholdOdds}
                      onChange={(e) => setScraps({ thresholdOdds: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Packages</Label>
                    <Input
                      type="number"
                      min={1}
                      value={settings.scraps.packages}
                      onChange={(e) => setScraps({ packages: Number(e.target.value) })}
                      className="h-8"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Split method</Label>
                    <select
                      value={settings.scraps.split}
                      onChange={(e) =>
                        setScraps({ split: e.target.value as CalcuttaSettings['scraps']['split'] })
                      }
                      className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="snake_by_odds">Snake by odds (balanced)</option>
                      <option value="random">Random</option>
                      <option value="curated">Admin curated</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Golfers with odds worse than +{settings.scraps.thresholdOdds} (or no odds) are
                  grouped into {settings.scraps.packages} packages, each auctioned as one lot.
                </p>
              </>
            )}
          </div>

          {/* Payout tiers */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Pot payouts by finish position</span>
              <Badge variant={Math.abs(tierTotal - 100) < 0.001 ? 'secondary' : 'destructive'}>
                {tierTotal}%
              </Badge>
            </div>
            <div className="space-y-1">
              {settings.payoutTiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-14 text-xs text-muted-foreground">Pos</span>
                  <Input
                    type="number"
                    min={1}
                    value={t.position}
                    onChange={(e) => setTier(i, { position: Number(e.target.value) })}
                    className="h-8 w-16"
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    value={t.pct}
                    onChange={(e) => setTier(i, { pct: Number(e.target.value) })}
                    className="h-8 w-20"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setSettings((s) => ({
                        ...s,
                        payoutTiers: s.payoutTiers.filter((_, j) => j !== i),
                      }))
                    }
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  payoutTiers: [
                    ...s.payoutTiers,
                    {
                      position: Math.max(0, ...s.payoutTiers.map((t) => t.position)) + 1,
                      pct: 0,
                    },
                  ],
                }))
              }
            >
              Add tier
            </Button>
            <p className="text-xs text-muted-foreground">
              Ties split the combined payout of the positions they occupy.
            </p>
          </div>

          {settingsError && <p className="text-sm text-destructive">{settingsError}</p>}
        </CardContent>
        <CardFooter>
          <Button
            onClick={() => run(() => updateCalcuttaSettings(tournamentId, poolId, settings), 'Settings saved')}
            disabled={isPending || settingsError !== null}
          >
            {isPending && <Spinner className="mr-2" />}
            Save Settings
          </Button>
        </CardFooter>
      </Card>

      {/* ---- Odds ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Golfer Odds</CardTitle>
          <CardDescription>
            Odds set the auction order (longshots first) and scraps eligibility. Fetch from The
            Odds API or enter American odds manually — manual entries are never overwritten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || golfers.length === 0}
            onClick={() =>
              run(async () => {
                const result = await seedCalcuttaOddsFromApi(tournamentId, poolId)
                if (!result.error) {
                  setMessage({
                    text: `Matched odds for ${result.matched} of ${result.total} golfers`,
                    isError: false,
                  })
                }
                return result
              })
            }
          >
            {isPending && <Spinner className="mr-2" />}
            Fetch Odds
          </Button>
          {golfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No golfers in the field yet.</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-2 py-1 text-left text-xs text-muted-foreground">Golfer</th>
                    <th className="px-2 py-1 text-left text-xs text-muted-foreground">Odds (+)</th>
                    <th className="px-2 py-1 text-left text-xs text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {golfers.map((g) => (
                    <GolferOddsRow
                      key={g.id}
                      golfer={g}
                      disabled={isPending}
                      onSave={(odds) =>
                        run(() => updateGolferOdds(tournamentId, poolId, g.id, odds))
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Lots ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Auction Order ({lots.length} lots)</CardTitle>
          <CardDescription>
            Lots are auctioned top to bottom. Reorder with the arrows, or regenerate from the
            current odds and scraps settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending || golfers.length === 0}
            onClick={() => run(() => regenerateCalcuttaLots(tournamentId, poolId), 'Lots regenerated')}
          >
            {isPending && <Spinner className="mr-2" />}
            Regenerate Lots
          </Button>

          {lots.length > 0 && (
            <div className="max-h-96 space-y-1 overflow-y-auto">
              {lots.map((lot, i) => (
                <div key={lot.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                  <span className="w-8 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium">{lot.label}</span>
                    {lot.kind === 'scraps' && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {lot.golfer_ids.length === 0
                          ? 'empty'
                          : lot.golfer_ids
                              .map((id) => golferById.get(id)?.name ?? '?')
                              .join(', ')}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending || i === 0}
                    onClick={() => moveLot(i, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending || i === lots.length - 1}
                    onClick={() => moveLot(i, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Curated scraps assignment */}
          {settings.scraps.enabled && settings.scraps.split === 'curated' && scrapsLots.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Assign scraps golfers to packages</p>
              {scrapsEligible.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No golfers currently qualify as scraps.
                </p>
              ) : (
                scrapsEligible.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{g.name}</span>
                    <select
                      value={assignedLotByGolfer.get(g.id) ?? ''}
                      disabled={isPending}
                      onChange={(e) =>
                        run(() =>
                          assignScrapsGolfer(tournamentId, poolId, g.id, e.target.value || null)
                        )
                      }
                      className="h-8 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">Unassigned</option>
                      {scrapsLots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-col items-start gap-2">
          {message && (
            <p className={`text-sm ${message.isError ? 'text-destructive' : 'text-green-700'}`}>
              {message.text}
            </p>
          )}
          <Button
            disabled={isPending}
            onClick={() => {
              if (!window.confirm('Start the auction? Settings and lots lock once it begins.')) return
              run(() => startCalcuttaAuction(tournamentId, poolId))
            }}
          >
            {isPending && <Spinner className="mr-2" />}
            Start Auction
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function GolferOddsRow({
  golfer,
  disabled,
  onSave,
}: {
  golfer: GolferRow
  disabled: boolean
  onSave: (odds: number | null) => void
}) {
  const [value, setValue] = useState(golfer.calcutta_odds === null ? '' : String(golfer.calcutta_odds))

  function commit() {
    const parsed = value.trim() === '' ? null : Number(value)
    if (parsed !== null && !Number.isInteger(parsed)) return
    if (parsed === golfer.calcutta_odds) return
    onSave(parsed)
  }

  return (
    <tr className="border-b">
      <td className="px-2 py-1">{golfer.name}</td>
      <td className="px-2 py-1">
        <Input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          placeholder="—"
          className="h-7 w-24"
        />
      </td>
      <td className="px-2 py-1 text-xs text-muted-foreground">{golfer.odds_source ?? '—'}</td>
    </tr>
  )
}
