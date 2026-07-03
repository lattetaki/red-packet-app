import type { TrendPoint } from '@/api'
import type { EntryClaim } from '@/types/app'

import { toNumber } from './number'

export function makeClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function newClaim(participantId = ''): EntryClaim {
  return { id: makeClientId(), participantId, amount: '' }
}

export function sumClaimAmounts(claims: EntryClaim[]) {
  return claims.reduce((total, claim) => total + toNumber(claim.amount), 0)
}

export function buildLatestTrendByUser(points: TrendPoint[]) {
  const latest = new Map<number, TrendPoint>()
  for (const point of points) {
    latest.set(point.participant_id, point)
  }
  return Array.from(latest.values()).sort((a, b) => toNumber(b.pnl_amount) - toNumber(a.pnl_amount))
}
