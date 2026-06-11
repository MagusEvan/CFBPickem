import type { GameBroadcast } from '@/lib/types'

/**
 * Extract the primary TV broadcast network for a given locale.
 * Prefers national broadcasts over local (home/away) markets.
 *
 * To support international users in the future, pass a different locale
 * (e.g. "uk", "mx") once those broadcasts are stored.
 */
export function getBroadcastForLocale(
  broadcasts: GameBroadcast[] | null,
  locale: string = 'us',
): string | null {
  if (!broadcasts || broadcasts.length === 0) return null

  const tvForLocale = broadcasts.filter(
    (b) => b.locale === locale && b.type === 'TV',
  )
  if (tvForLocale.length === 0) return null

  const national = tvForLocale.find((b) => b.market === 'National')
  return (national ?? tvForLocale[0]).network
}

/**
 * Parse ESPN's geoBroadcasts array into our portable GameBroadcast format.
 * ESPN markets: id "1" = National, "2" = Home, "3" = Away.
 * All are US-locale for the endpoints we currently use.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEspnBroadcasts(geoBroadcasts: any[] | undefined): GameBroadcast[] {
  if (!geoBroadcasts || !Array.isArray(geoBroadcasts)) return []

  return geoBroadcasts
    .map((gb) => {
      const network = gb.media?.shortName
      if (!network) return null

      const type = gb.type?.shortName ?? 'TV'
      const marketType = gb.market?.type ?? 'National'

      // ESPN US endpoints only return US broadcasts.
      // When international feeds are added, derive locale from market id or lang field.
      const locale = 'us'

      return { network, type, market: marketType, locale }
    })
    .filter((b): b is GameBroadcast => b !== null)
}
