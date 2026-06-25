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
  deleted_at: string | null
  deleted_by_user_id: number | null
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
  avatar_data_url: string | null
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
  participant_id: number | null
  participant_name: string | null
  avatar_data_url: string | null
  role: 'admin' | 'viewer' | 'contributor'
  is_active: boolean
}

export type LoginResponse = {
  user: AppUser
  token: string
}

export type BackupInfo = {
  filename: string
  size_bytes: number
  created_at: string
}

export type Announcement = {
  id: number
  title: string
  version: string
  content: string
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

export type AnnouncementPayload = {
  title: string
  version: string
  content: string
}

export type PinnedNotice = {
  content: string
  updated_at: string | null
}

export type PopupNoticeCurrent = {
  id: number
  title: string
  content: string
  created_at: string
} | null

export type PopupNoticeRecipient = {
  user_id: number
  username: string
  display_name: string
  seen_at: string | null
  dismissed_at: string | null
}

export type PopupNotice = {
  id: number
  title: string
  content: string
  is_active: boolean
  created_by_user_id: number | null
  created_at: string
  updated_at: string
  recipients: PopupNoticeRecipient[]
}

export type PopupNoticePayload = {
  title: string
  content: string
  recipient_user_ids: number[]
  is_active: boolean
}

export type StatsParticipant = {
  id: number
  name: string
  avatar_data_url: string | null
}

export type ClaimRecordStat = {
  participant: StatsParticipant
  sender: StatsParticipant
  amount: string
  record_id: number
  time: string
}

export type StreakRecordStat = {
  participant: StatsParticipant
  count: number
}

export type CounterpartyRecordStat = {
  participant: StatsParticipant
  amount: string
}

export type PersonalRecordStats = {
  participant: StatsParticipant
  max_claim: ClaimRecordStat | null
  min_claim: ClaimRecordStat | null
  max_win_streak: number
  max_loss_streak: number
  top_received_from: CounterpartyRecordStat | null
  top_sent_to: CounterpartyRecordStat | null
  top_net_received_from: CounterpartyRecordStat | null
  top_net_sent_to: CounterpartyRecordStat | null
}

export type RecordStatsResponse = {
  max_claims: ClaimRecordStat[]
  min_claims: ClaimRecordStat[]
  max_win_streaks: StreakRecordStat[]
  max_loss_streaks: StreakRecordStat[]
  personal: PersonalRecordStats[]
}

export type AppUserCreatePayload = {
  username: string
  display_name: string
  password: string
  participant_id?: number | null
  role: AppUser['role']
  is_active: boolean
}

export type AppUserUpdatePayload = {
  display_name: string
  password?: string
  participant_id?: number | null
  role: AppUser['role']
  is_active: boolean
}

export type StatsQuery = {
  dateFrom?: string
  dateTo?: string
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

function appendStatsParams(path: string, query: StatsQuery = {}) {
  const params = new URLSearchParams()
  if (query.dateFrom) params.set('date_from', query.dateFrom)
  if (query.dateTo) params.set('date_to', query.dateTo)
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

export function getSummaryStats(query: StatsQuery = {}) {
  return getJson<SummaryStats>(appendStatsParams('/stats/summary', query))
}

export function login(username: string, password: string) {
  return postJson<LoginResponse, { username: string; password: string }>('/auth/login', { username, password })
}

export function getMe() {
  return getJson<AppUser>('/me')
}

export function updateMyAvatar(avatarDataUrl: string | null) {
  return putJson<AppUser, { avatar_data_url: string | null }>('/me/avatar', { avatar_data_url: avatarDataUrl })
}

export function changeMyPassword(oldPassword: string, newPassword: string) {
  return putJson<AppUser, { old_password: string; new_password: string }>('/me/password', {
    old_password: oldPassword,
    new_password: newPassword,
  })
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

export function getUserStats(query: StatsQuery = {}) {
  return getJson<UserStatsItem[]>(appendStatsParams('/stats/users', query))
}

export function getTrendPoints(query: StatsQuery = {}) {
  return getJson<TrendPoint[]>(appendStatsParams('/stats/trends', query))
}

export function getRecordStats(query: StatsQuery = {}) {
  return getJson<RecordStatsResponse>(appendStatsParams('/stats/records', query))
}

export function getParticipants() {
  return getJson<Participant[]>('/participants')
}

export function createParticipant(name: string) {
  return postJson<Participant, { name: string }>('/participants', { name })
}

export function updateParticipantAvatar(participantId: number, avatarDataUrl: string | null) {
  return putJson<Participant, { avatar_data_url: string | null }>(`/participants/${participantId}/avatar`, { avatar_data_url: avatarDataUrl })
}

export function getAmountPresets() {
  return getJson<AmountPreset[]>('/amount-presets')
}

export function getAnnouncements() {
  return getJson<Announcement[]>('/announcements')
}

export function getPinnedNotice() {
  return getJson<PinnedNotice>('/pinned-notice')
}

export function updatePinnedNotice(content: string) {
  return putJson<PinnedNotice, { content: string }>('/admin/pinned-notice', { content })
}

export function getCurrentPopupNotice() {
  return getJson<PopupNoticeCurrent>('/popup-notices/current')
}

export function ackPopupNotice(noticeId: number, dismiss: boolean) {
  return postJson<{ ok: boolean }, { dismiss: boolean }>(`/popup-notices/${noticeId}/ack`, { dismiss })
}

export function getPopupNotices() {
  return getJson<PopupNotice[]>('/admin/popup-notices')
}

export function createPopupNotice(payload: PopupNoticePayload) {
  return postJson<PopupNotice, PopupNoticePayload>('/admin/popup-notices', payload)
}

export function updatePopupNotice(noticeId: number, payload: PopupNoticePayload) {
  return putJson<PopupNotice, PopupNoticePayload>(`/admin/popup-notices/${noticeId}`, payload)
}

export function createAnnouncement(payload: AnnouncementPayload) {
  return postJson<Announcement, AnnouncementPayload>('/admin/announcements', payload)
}

export function updateAnnouncement(announcementId: number, payload: AnnouncementPayload) {
  return putJson<Announcement, AnnouncementPayload>(`/admin/announcements/${announcementId}`, payload)
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

export function getDeletedRecords(query: Pick<RecordQuery, 'offset' | 'limit'> = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit ?? 50))
  params.set('offset', String(query.offset ?? 0))
  return getJson<RecordListResponse>(`/admin/deleted-records?${params.toString()}`)
}

export function restoreDeletedRecord(recordId: number) {
  return postJson<RecordDetail, Record<string, never>>(`/admin/deleted-records/${recordId}/restore`, {})
}

export function getBackups() {
  return getJson<BackupInfo[]>('/admin/backups')
}

export function createBackup() {
  return postJson<BackupInfo, Record<string, never>>('/admin/backups', {})
}

export async function downloadBackup(filename: string) {
  const response = await fetch(`${API_BASE_URL}/admin/backups/${encodeURIComponent(filename)}`, {
    headers: buildHeaders(),
  })
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  return response.blob()
}

export function approveRecord(recordId: number) {
  return postJson<RecordDetail, Record<string, never>>(`/admin/review-records/${recordId}/approve`, {})
}

export function rejectRecord(recordId: number) {
  return postJson<RecordDetail, Record<string, never>>(`/admin/review-records/${recordId}/reject`, {})
}
