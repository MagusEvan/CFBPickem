// Week pill row — server-safe, navigation via links.

import Link from 'next/link'

export function WeekSelector({
  weeks,
  selected,
  hrefFor,
}: {
  weeks: number
  selected: number
  hrefFor: (week: number) => string
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: weeks }, (_, i) => i + 1).map((w) => (
        <Link
          key={w}
          href={hrefFor(w)}
          className={`rounded-md border px-2 py-1 text-xs ${
            w === selected
              ? 'border-primary bg-primary/10 font-semibold'
              : 'border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          {w}
        </Link>
      ))}
    </div>
  )
}
