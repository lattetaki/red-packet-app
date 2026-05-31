const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'
let authToken: string | null = null

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
  created_by_user_id: number | null
}

export type RecordListResponse = {
  items: RecordListItem[]
  total: number
}

export type ClaimRead = {
  id: number
  participant_id: number
  participant_name: string
  amount: string
}

export type RecordDetail = RecordListItem & {
  claims: ClaimRead[]
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

export type TrendPoint = {
  record_id: number
  time: string
  participant_id: number
  participant_name: string
  pnl_amount: string
}

export type Participant = {
  id: number
  name: string
  is_active: boolean
}

export type AmountPreset = {
  id: number
  amount: string
  is_active: boolean
}

export type AppUser = {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'viewer' | 'contributor'
  is_active: boolean
}

export type LoginResponse = {
  user: AppUser
  token: string
}

export type AppUserCreatePayload = {
  username: string
  display_name: string
  password: string
  role: AppUser['role']
  is_active: boolean
}

export type AppUserUpdatePayload = {
  display_name: string
  password?: string
  role: AppUser['role']
  is_active: boolean
}

export type RecordCreatePayload = {
  time?: string
  sender_id: number
  total_amount: string
  note: string
  status: 'approved' | 'pending' | 'rejected'
  claims: Array<{
    participant_id: number
    amount: string
  }>
}

export type RecordQuery = {
  status?: string
  senderId?: string
  receiverId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  offset?: number
  limit?: number
}

function buildHeaders(hasJsonBody = false) {
  const headers: Record<string, string> = {}
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json'
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`
  }
  return headers
}

export function setAuthToken(token: string | null) {
  authToken = token
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    setAuthToken(null)
    window.dispatchEvent(new CustomEvent('red-packet-auth-expired'))
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(),
  })

  return handleResponse<T>(response)
}

async function postJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  })

  return handleResponse<TResponse>(response)
}

async function putJson<TResponse, TPayload>(path: string, payload: TPayload): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: buildHeaders(true),
    body: JSON.stringify(payload),
  })

  return handleResponse<TResponse>(response)
}

async function deleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })

  return handleResponse<T>(response)
}

export function getSummaryStats() {
  return getJson<SummaryStats>('/stats/summary')
}

export function login(username: string, password: string) {
  return postJson<LoginResponse, { username: string; password: string }>('/auth/login', { username, password })
}

export function getRecentRecords(limit = 6) {
  return getRecords({ limit, status: 'approved' })
}

export function getRecords(query: RecordQuery = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit ?? 30))
  params.set('offset', String(query.offset ?? 0))
  if (query.status) params.set('status', query.status)
  if (query.senderId) params.set('sender_id', query.senderId)
  if (query.receiverId) params.set('receiver_id', query.receiverId)
  if (query.search) params.set('search', query.search)
  if (query.dateFrom) params.set('date_from', query.dateFrom)
  if (query.dateTo) params.set('date_to', query.dateTo)
  return getJson<RecordListResponse>(`/records?${params.toString()}`)
}

export function getMyRecords(query: Pick<RecordQuery, 'offset' | 'limit'> = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit ?? 30))
  params.set('offset', String(query.offset ?? 0))
  return getJson<RecordListResponse>(`/records/my?${params.toString()}`)
}

export function getRecord(recordId: number) {
  return getJson<RecordDetail>(`/records/${recordId}`)
}

export function getUserStats() {
  return getJson<UserStatsItem[]>('/stats/users')
}

export function getTrendPoints() {
  return getJson<TrendPoint[]>('/stats/trends')
}

export function getParticipants() {
  return getJson<Participant[]>('/participants')
}

export function createParticipant(name: string) {
  return postJson<Participant, { name: string }>('/participants', { name })
}

export function getAmountPresets() {
  return getJson<AmountPreset[]>('/amount-presets')
}

export function getAppUsers() {
  return getJson<AppUser[]>('/admin/app-users')
}

export function createAppUser(payload: AppUserCreatePayload) {
  return postJson<AppUser, AppUserCreatePayload>('/admin/app-users', payload)
}

export function updateAppUser(userId: number, payload: AppUserUpdatePayload) {
  return putJson<AppUser, AppUserUpdatePayload>(`/admin/app-users/${userId}`, payload)
}

export function createRecord(payload: RecordCreatePayload) {
  return postJson<RecordDetail, RecordCreatePayload>('/records', payload)
}

export function updateRecord(recordId: number, payload: RecordCreatePayload) {
  return putJson<RecordDetail, RecordCreatePayload>(`/records/${recordId}`, payload)
}

export function deleteRecord(recordId: number) {
  return deleteJson<{ deleted: boolean }>(`/records/${recordId}`)
}

export function approveRecord(recordId: number) {
  return postJson<RecordDetail, Record<string, never>>(`/admin/review-records/${recordId}/approve`, {})
}

export function rejectRecord(recordId: number) {
  return postJson<RecordDetail, Record<string, never>>(`/admin/review-records/${recordId}/reject`, {})
}
