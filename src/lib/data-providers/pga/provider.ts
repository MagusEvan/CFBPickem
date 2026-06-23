import type { PgaGolferData, PgaEventInfo } from './types'
import { fetchPgaMajors, fetchPgaEventGolfers } from './espn-adapter'

export interface PgaDataProvider {
  getMajors(year: number): Promise<PgaEventInfo[]>
  getEventGolfers(eventId: string): Promise<PgaGolferData[]>
}

export class EspnPgaProvider implements PgaDataProvider {
  async getMajors(year: number): Promise<PgaEventInfo[]> {
    return fetchPgaMajors(year)
  }

  async getEventGolfers(eventId: string): Promise<PgaGolferData[]> {
    return fetchPgaEventGolfers(eventId)
  }
}

export function getPgaProvider(): PgaDataProvider {
  return new EspnPgaProvider()
}
