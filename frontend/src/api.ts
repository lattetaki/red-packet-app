const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export type SummaryStats = {
  record_count: number
  participant_count: number
  total_sent_amount: string
  total_claimed_amount: string
  pending_count: number
}

export type RecordListItem = {
  id: number
  legacy_id: string | null
  time: string
  sender_id: number
  sender_name: string
  total_amount: string
  claimed_amount: string
  claim_count: number
  note: string
  status: string
}

export type UserStatsItem = {
  participant_id: number
  name: string
  send_count: number
  send_amount: string
  receive_count: number
  receive_amount: string
  average_receive_amount: string
  pnl_amount: string
  send_ratio: string
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function getSummaryStats() {
  return getJson<SummaryStats>('/stats/summary')
}

export function getRecentRecords(limit = 6) {
  return getJson<RecordListItem[]>(`/records?limit=${limit}&status=approved`)
}

export function getUserStats() {
  return getJson<UserStatsItem[]>('/stats/users')
}
