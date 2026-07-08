import Link from 'next/link'
import type { FFStanding } from '@/lib/ff/standings'

/** H2H standings table with a playoff cut line. */
export function FfStandingsTable({
  poolId,
  standings,
  nameByMember,
  playoffTeams,
}: {
  poolId: string
  standings: FFStanding[]
  nameByMember: Map<string, string>
  playoffTeams: number
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="px-2 py-2 text-left">#</th>
          <th className="px-2 py-2 text-left">Manager</th>
          <th className="px-2 py-2 text-center">W</th>
          <th className="px-2 py-2 text-center">L</th>
          <th className="px-2 py-2 text-center">T</th>
          <th className="px-2 py-2 text-right">PF</th>
          <th className="px-2 py-2 text-right">PA</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, i) => (
          <tr
            key={s.memberId}
            className={
              i === playoffTeams - 1 && playoffTeams < standings.length
                ? 'border-b-2 border-dashed border-primary/40'
                : 'border-b'
            }
          >
            <td className="px-2 py-2 font-medium">{i + 1}</td>
            <td className="px-2 py-2">
              <Link
                href={`/pools/${poolId}/rosters/${s.memberId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {nameByMember.get(s.memberId) ?? '—'}
              </Link>
            </td>
            <td className="px-2 py-2 text-center">{s.wins}</td>
            <td className="px-2 py-2 text-center">{s.losses}</td>
            <td className="px-2 py-2 text-center">{s.ties}</td>
            <td className="px-2 py-2 text-right font-mono tabular-nums">{s.pointsFor.toFixed(2)}</td>
            <td className="px-2 py-2 text-right font-mono tabular-nums">{s.pointsAgainst.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
