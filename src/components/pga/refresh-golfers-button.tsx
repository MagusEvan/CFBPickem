'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw, Check } from 'lucide-react'
import { refreshTournamentGolfers } from '@/lib/pga/actions'

export function RefreshGolfersButton({ tournamentId }: { tournamentId: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  function handleRefresh() {
    setResult(null)
    setErrorMsg(null)
    startTransition(async () => {
      const res = await refreshTournamentGolfers(tournamentId)
      if (res?.error) {
        setResult('error')
        setErrorMsg(res.error)
      } else {
        setResult('success')
        router.refresh()
        setTimeout(() => setResult(null), 4000)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRefresh}
        disabled={isPending}
        className="border-foreground/25"
      >
        <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Refreshing…' : 'Refresh Field'}
      </Button>
      {result === 'success' && (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" />
          Updated
        </span>
      )}
      {result === 'error' && (
        <span className="text-xs text-destructive">
          {errorMsg || 'Refresh failed'}
        </span>
      )}
    </div>
  )
}
