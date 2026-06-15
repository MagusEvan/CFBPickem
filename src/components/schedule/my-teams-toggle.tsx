'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

export function MyTeamsToggle({ active }: { active: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const params = new URLSearchParams(searchParams.toString())
    if (active) {
      params.delete('mine')
    } else {
      params.set('mine', 'true')
    }
    startTransition(() => {
      router.push(`?${params.toString()}`)
    })
  }

  return (
    <Button
      variant={active ? 'default' : 'outline'}
      size="sm"
      onClick={toggle}
      disabled={isPending}
      className="border-foreground/25"
    >
      {active ? 'My Teams' : 'All Teams'}
    </Button>
  )
}
