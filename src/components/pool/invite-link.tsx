'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Share2, Check, Copy } from 'lucide-react'

export function InviteLinkButton({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${inviteCode}`

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="cursor-pointer transition-colors hover:bg-muted/50" onClick={copyLink}>
      <CardContent className="flex items-center gap-3 pt-6">
        {copied ? (
          <Check className="h-5 w-5 text-green-600" />
        ) : (
          <Share2 className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">{copied ? 'Copied!' : 'Invite Link'}</p>
          <p className="text-sm text-muted-foreground">Click to copy</p>
        </div>
      </CardContent>
    </Card>
  )
}
