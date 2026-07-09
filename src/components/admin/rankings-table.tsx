'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { refreshFfRankings, updateFfPlayerRanks } from '@/lib/ff/ranking-actions'
import type { FFPosition } from '@/lib/ff/types'

export interface AdminRankRow {
  id: string
  name: string
  position: FFPosition
  team: string | null
  espn: number | null
  yahoo: number | null
  sleeper: number | null
  fantasypros: number | null
  composite: number | null
}

type SourceKey = 'espn' | 'yahoo' | 'sleeper' | 'fantasypros'
const SOURCES: Array<{ key: SourceKey; label: string }> = [
  { key: 'espn', label: 'ESPN' },
  { key: 'yahoo', label: 'Yahoo' },
  { key: 'sleeper', label: 'Sleeper' },
  { key: 'fantasypros', label: 'FantasyPros' },
]
const POSITIONS: Array<FFPosition | 'ALL'> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DST']
const PAGE_SIZE = 200

type Edits = Partial<Record<SourceKey, string>>

function mean(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null)
  if (present.length === 0) return null
  return Math.round((present.reduce((s, v) => s + v, 0) / present.length) * 100) / 100
}

function parseRank(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? Math.round(n) : null
}

export function RankingsTable({
  players,
  seasonYear,
}: {
  players: AdminRankRow[]
  seasonYear: number
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<FFPosition | 'ALL'>('ALL')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [edits, setEdits] = useState<Record<string, Edits>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return players.filter(
      (p) =>
        (position === 'ALL' || p.position === position) &&
        (q === '' || p.name.toLowerCase().includes(q))
    )
  }, [players, query, position])

  const currentValue = (p: AdminRankRow, key: SourceKey): string => {
    const edit = edits[p.id]?.[key]
    if (edit !== undefined) return edit
    const v = p[key]
    return v === null ? '' : String(v)
  }

  const isDirty = (p: AdminRankRow) => {
    const e = edits[p.id]
    if (!e) return false
    return SOURCES.some(({ key }) => key in e && parseRank(e[key] ?? '') !== p[key])
  }

  const setEdit = (id: string, key: SourceKey, value: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }

  const save = (p: AdminRankRow) => {
    setSavingId(p.id)
    setError(null)
    startTransition(async () => {
      const result = await updateFfPlayerRanks(p.id, {
        espn: parseRank(currentValue(p, 'espn')),
        yahoo: parseRank(currentValue(p, 'yahoo')),
        sleeper: parseRank(currentValue(p, 'sleeper')),
        fantasypros: parseRank(currentValue(p, 'fantasypros')),
      })
      setSavingId(null)
      if (result.error) setError(result.error)
      else {
        setEdits((prev) => {
          const next = { ...prev }
          delete next[p.id]
          return next
        })
        router.refresh()
      }
    })
  }

  const refresh = () => {
    setRefreshing(true)
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const result = await refreshFfRankings(seasonYear)
      setRefreshing(false)
      if (result.error) setError(result.error)
      else if (result.summary) {
        const s = result.summary
        const part = (label: string, n: number | null) =>
          n === null ? `${label} failed` : `${label} ${n}`
        setMessage(
          `Ranked players — ${part('ESPN', s.espn)}, ${part('Sleeper', s.sleeper)}, ${part('FantasyPros', s.fantasypros)}`
        )
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search players…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE_SIZE)
          }}
          className="h-9 max-w-60"
        />
        <div className="flex gap-1">
          {POSITIONS.map((pos) => (
            <Button
              key={pos}
              size="sm"
              variant={position === pos ? 'default' : 'outline'}
              onClick={() => {
                setPosition(pos)
                setLimit(PAGE_SIZE)
              }}
            >
              {pos === 'ALL' ? 'All' : pos}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh from sources'}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Player</th>
              <th className="px-2 py-2">Pos</th>
              {SOURCES.map((s) => (
                <th key={s.key} className="px-2 py-2 text-center">{s.label}</th>
              ))}
              <th className="px-2 py-2 text-center">Composite</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((p, i) => {
              const dirty = isDirty(p)
              const liveComposite = mean(
                SOURCES.map(({ key }) => parseRank(currentValue(p, key)))
              )
              return (
                <tr key={p.id} className="border-b">
                  <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">{p.name}</span>
                    {p.team && (
                      <span className="ml-1.5 text-xs text-muted-foreground">{p.team}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant="outline" className="text-xs">{p.position}</Badge>
                  </td>
                  {SOURCES.map(({ key }) => (
                    <td key={key} className="px-2 py-1.5 text-center">
                      <Input
                        type="number"
                        min={1}
                        value={currentValue(p, key)}
                        onChange={(e) => setEdit(p.id, key, e.target.value)}
                        className="mx-auto h-7 w-16 text-center text-xs"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center font-mono tabular-nums">
                    {liveComposite === null ? '—' : liveComposite.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!dirty || savingId === p.id}
                      onClick={() => save(p)}
                    >
                      {savingId === p.id ? 'Saving…' : 'Save'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > limit && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Show more ({filtered.length - limit} remaining)
          </Button>
        </div>
      )}
      {filtered.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No players match.</p>
      )}
    </div>
  )
}
