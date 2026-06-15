'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function MyTeamsToggle() {
  const [mineOnly, setMineOnly] = useState(false)

  return (
    <>
      <Button
        variant={mineOnly ? 'default' : 'outline'}
        size="sm"
        onClick={() => setMineOnly(!mineOnly)}
        className="border-foreground/25"
      >
        {mineOnly ? 'My Teams' : 'All Teams'}
      </Button>
      {mineOnly && (
        <style>{`
          [data-mine="false"] { display: none !important; }
          .game-section:not(:has([data-mine="true"])) { display: none !important; }
        `}</style>
      )}
    </>
  )
}
