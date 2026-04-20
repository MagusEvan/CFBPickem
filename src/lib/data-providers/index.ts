import type { DataProvider } from './provider'
import { CfbdProvider } from './cfbd/provider'
import { EspnProvider } from './espn/provider'

export function getDataProvider(): DataProvider {
  const providerName = process.env.NEXT_PUBLIC_DATA_PROVIDER || 'cfbd'
  switch (providerName) {
    case 'espn':
      return new EspnProvider()
    case 'cfbd':
    default:
      return new CfbdProvider()
  }
}

export type { DataProvider } from './provider'
export type { CfbTeam, CfbGame, CfbTeamRecord } from './types'
