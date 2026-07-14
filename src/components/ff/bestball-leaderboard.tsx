// Best ball total-points leaderboard: cumulative optimal points per manager
// with per-week columns. Server-safe presentational component.

import Link from 'next/link'

export function BestBallLeaderboard({
  poolId,
  members,
  weekScores,
}: {
  poolId: string
  members: Array<{ id: string; name: string }>
  weekScores: Array<{ week: number; final: boolean; scores: Record<string, number> }>
}) {
  const rows = members
    .map((m) => {
      const weekPoints = weekScores.map((ws) => ws.scores[m.id] ?? 0)
      return {
        id: m.id,
        name: m.name,
        weekPoints,
        total: Math.round(weekPoints.reduce((sum, p) => sum + p, 0) * 100) / 100,
      }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="px-2 py-2 text-left">#</th>
          <th className="px-2 py-2 text-left">Manager</th>
          {weekScores.map((ws) => (
            <th
              key={ws.week}
              className="px-2 py-2 text-center text-xs"
              title={ws.final ? 'Final' : 'In progress'}
            >
              W{ws.week}
              {!ws.final && <span className="text-muted-foreground">*</span>}
            </th>
          ))}
          <th className="px-2 py-2 text-center">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id} className="border-b">
            <td className="px-2 py-2 font-medium">{i + 1}</td>
            <td className="px-2 py-2 whitespace-nowrap">
              <Link
                href={`/pools/${poolId}/team?member=${row.id}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {row.name}
              </Link>
            </td>
            {row.weekPoints.map((pts, w) => (
              <td key={w} className="px-2 py-2 text-center tabular-nums">
                {pts.toFixed(1)}
              </td>
            ))}
            <td className="px-2 py-2 text-center font-bold tabular-nums">{row.total.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
