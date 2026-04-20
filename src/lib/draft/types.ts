export interface SnakePick {
  round: number
  pickNumber: number
  managerPosition: number // 1-indexed draft position
}

export interface DraftConfig {
  managerCount: number
  conferences: string[] // ordered list of conference keys, one per round
}

export interface PickValidation {
  valid: boolean
  error?: string
}
