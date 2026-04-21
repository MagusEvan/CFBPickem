export interface SnakePick {
  round: number
  pickNumber: number
  managerPosition: number // 1-indexed draft position
}

export interface DraftConfig {
  managerCount: number
  numRounds: number // number of conferences = number of rounds
}

export interface PickValidation {
  valid: boolean
  error?: string
}
