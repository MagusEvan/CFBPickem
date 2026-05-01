'use client'

import { useState } from 'react'
import { createPool } from '@/lib/pools/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

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

export default function CreatePoolPage() {
  const [selectedConferences, setSelectedConferences] = useState<string[]>(DEFAULT_SELECTED)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function toggleConference(key: string) {
    setSelectedConferences((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    try {
      // Append selected conferences to form data
      selectedConferences.forEach((key) => formData.append('conferences', key))
      await createPool(formData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

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

            <div className="space-y-2">
              <Label htmlFor="name">Pool Name</Label>
              <Input id="name" name="name" placeholder="e.g. The Gridiron League" required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="season_year">Season Year</Label>
                <Input
                  id="season_year"
                  name="season_year"
                  type="number"
                  defaultValue={new Date().getFullYear()}
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
                  defaultValue={10}
                  min={4}
                  max={16}
                />
              </div>
            </div>

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
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading || selectedConferences.length === 0}>
              {loading && <Spinner className="mr-2" />}
              {loading ? 'Creating...' : 'Create Pool'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
