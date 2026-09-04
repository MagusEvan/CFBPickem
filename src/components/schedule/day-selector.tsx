'use client'

import { useState } from 'react'

interface DayInfo {
  key: string
  label: string
  count: number
  isToday: boolean
}

export function DaySelector({
  days,
  defaultDay,
  children,
}: {
  days: DayInfo[]
  defaultDay: string
  children: React.ReactNode[]
}) {
  const [selected, setSelected] = useState(defaultDay)

  return (
    <>
      {days.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <button
              key={d.key}
              onClick={() => setSelected(d.key)}
              className={`inline-flex w-16 flex-col items-center rounded-md py-1.5 text-sm transition-colors ${
                d.key === selected
                  ? 'bg-primary text-primary-foreground'
                  : d.count === 0
                    ? 'bg-muted text-muted-foreground/40'
                    : 'bg-muted hover:bg-muted/80'
              }`}
            >
              <span className="font-medium">{d.isToday ? 'Today' : d.label}</span>
              <span className="text-[10px] opacity-70">{d.count} {d.count === 1 ? 'game' : 'games'}</span>
            </button>
          ))}
        </div>
      )}
      {children.map((child, i) => (
        <div key={days[i]?.key ?? i} className={days[i]?.key === selected ? '' : 'hidden'}>
          {child}
        </div>
      ))}
    </>
  )
}
