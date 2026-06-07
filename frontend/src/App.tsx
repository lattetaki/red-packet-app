import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Database,
  Download,
  Gift,
  Home,
  ImageUp,
  LockKeyhole,
  LogOut,
  ListChecks,
  Medal,
  Plus,
  RotateCcw,
  Search,
  Trophy,
  Users,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  approveRecord,
  createAnnouncement,
  createBackup,
  createAppUser,
  createParticipant,
  createRecord,
  deleteRecord,
  downloadBackup,
  getAmountPresets,
  getAnnouncements,
  getAppUsers,
  getBackups,
  getDeletedRecords,
  getParticipants,
  getRecord,
  getRecords,
  getRecordStats,
  getMyRecords,
  getRecentRecords,
  getSummaryStats,
  getTrendPoints,
  getUserStats,
  login,
  setAuthToken,
  type Announcement,
  type AnnouncementPayload,
  type AppUser,
  type AppUserCreatePayload,
  type AppUserUpdatePayload,
  type AmountPreset,
  type BackupInfo,
  type ClaimRecordStat,
  type CounterpartyRecordStat,
  type Participant,
  type PersonalRecordStats,
  type RecordCreatePayload,
  type RecordDetail,
  type RecordListItem,
  type RecordStatsResponse,
  type StatsParticipant,
  type StreakRecordStat,
  type SummaryStats,
  type TrendPoint,
  type UserStatsItem,
  rejectRecord,
  restoreDeletedRecord,
  updateAnnouncement,
  updateAppUser,
  updateParticipantAvatar,
  updateRecord,
} from './api'
import './App.css'

type ViewKey = 'dashboard' | 'entry' | 'records' | 'recordStats' | 'announcements' | 'review' | 'deleted' | 'users' | 'backup' | 'import'

type SummaryItem = {
  label: string
  value: string
  helper: string
  icon: ElementType
}

type EntryClaim = {
  id: string
  participantId: string
  amount: string
}

type AppUserDraft = {
  displayName: string
  role: AppUser['role']
  isActive: boolean
  password: string
}

type AuthSession = {
  user: AppUser
  token: string
}

type AvatarCropState = {
  participant: Participant
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  scale: number
  offsetX: number
  offsetY: number
  dragging: boolean
  dragStartX: number
  dragStartY: number
  dragOriginX: number
  dragOriginY: number
}

const navItems: Array<{ label: string; icon: ElementType; key: ViewKey }> = [
  { label: '首页', icon: Home, key: 'dashboard' },
  { label: '录入', icon: Plus, key: 'entry' },
  { label: '记录列表', icon: ListChecks, key: 'records' },
  { label: '记录统计', icon: Trophy, key: 'recordStats' },
  { label: '更新公告', icon: BookOpen, key: 'announcements' },
  { label: '审核队列', icon: LockKeyhole, key: 'review' },
  { label: '已删除记录', icon: RotateCcw, key: 'deleted' },
  { label: '用户管理', icon: Users, key: 'users' },
  { label: '备份管理', icon: Download, key: 'backup' },
  { label: '数据导入', icon: Database, key: 'import' },
]

const viewerVisibleViews = new Set<ViewKey>(['dashboard', 'entry', 'records', 'recordStats', 'announcements'])
const savedUserKey = 'red-packet-current-user'
const senderDefaultsKey = 'red-packet-sender-default-amounts'
const appEnvironmentLabel = import.meta.env.VITE_APP_ENV_LABEL ?? ''

const chartColors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#4f46e5']
const avatarCropPreviewSize = 280
const avatarOutputSize = 256

const fallbackSummary: SummaryStats = {
  record_count: 0,
  participant_count: 0,
  total_sent_amount: '0',
  total_claimed_amount: '0',
  pending_count: 0,
}

const fallbackRecordStats: RecordStatsResponse = {
  max_claims: [],
  min_claims: [],
  max_win_streaks: [],
  max_loss_streaks: [],
  personal: [],
}

function formatMoney(amount: string) {
  return `¥${amount}`
}

function formatTime(value: string) {
  return value.replace('T', ' ').slice(0, 19)
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

function AvatarBubble({ participant, size = 'md' }: { participant: StatsParticipant | Participant; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = {
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-14 text-base',
    xl: 'size-20 text-xl',
  }

  return (
    <div className={`shrink-0 overflow-hidden rounded-lg bg-red-50 font-semibold text-red-700 ring-1 ring-red-100 ${sizes[size]}`}>
      {participant.avatar_data_url ? (
        <img className="size-full object-cover" src={participant.avatar_data_url} alt={`${participant.name} avatar`} />
      ) : (
        <div className="flex size-full items-center justify-center">{initials(participant.name)}</div>
      )}
    </div>
  )
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatRole(role: AppUser['role']) {
  const labels: Record<AppUser['role'], string> = {
    admin: '管理员',
    viewer: '只读用户',
    contributor: '协助录入',
  }
  return labels[role]
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    approved: '已审核',
    pending: '待审核',
    rejected: '已驳回',
  }
  return labels[status] ?? status
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toRatioNumber(value: string) {
  if (value === '-') return -1
  return toNumber(value.replace('%', ''))
}

function currentDateTimeLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

function toDateTimeLocal(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return currentDateTimeLocal()
  }
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function makeClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function newClaim(participantId = ''): EntryClaim {
  return { id: makeClientId(), participantId, amount: '' }
}

function readSavedSession() {
  const raw = window.localStorage.getItem(savedUserKey)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (!parsed.user || !parsed.token) {
      window.localStorage.removeItem(savedUserKey)
      return null
    }
    setAuthToken(parsed.token)
    return parsed as AuthSession
  } catch {
    window.localStorage.removeItem(savedUserKey)
    return null
  }
}

function readSenderDefaults() {
  const raw = window.localStorage.getItem(senderDefaultsKey)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    window.localStorage.removeItem(senderDefaultsKey)
    return {}
  }
}

function sumClaimAmounts(claims: EntryClaim[]) {
  return claims.reduce((total, claim) => total + toNumber(claim.amount), 0)
}

function buildLatestTrendByUser(points: TrendPoint[]) {
  const latest = new Map<number, TrendPoint>()
  for (const point of points) {
    latest.set(point.participant_id, point)
  }
  return Array.from(latest.values()).sort((a, b) => toNumber(b.pnl_amount) - toNumber(a.pnl_amount))
}

function TrendLineChart({ trends, selectedIds }: { trends: TrendPoint[]; selectedIds: Set<number> }) {
  const series = Array.from(
    trends.reduce((grouped, point) => {
      if (!selectedIds.has(point.participant_id)) {
        return grouped
      }
      grouped.set(point.participant_id, [...(grouped.get(point.participant_id) ?? []), point])
      return grouped
    }, new Map<number, TrendPoint[]>()),
  ).map(([participantId, values], index) => ({
    participantId,
    name: values[0]?.participant_name ?? `用户 ${participantId}`,
    color: chartColors[index % chartColors.length],
    values: values.map((item) => toNumber(item.pnl_amount)),
  }))

  const allValues = series.flatMap((item) => item.values)
  const minValue = Math.min(0, ...allValues)
  const maxValue = Math.max(0, ...allValues)
  const span = maxValue - minValue || 1
  const width = 720
  const height = 260
  const padding = { top: 18, right: 20, bottom: 28, left: 52 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const zeroY = padding.top + (maxValue / span) * plotHeight

  if (series.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
        请选择至少一个用户查看趋势
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <svg className="min-w-[720px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="累计盈亏趋势折线图">
        <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="8" fill="#f8fafc" />
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = padding.top + (tick / 4) * plotHeight
          const value = maxValue - (tick / 4) * span

          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">
                {value.toFixed(0)}
              </text>
            </g>
          )
        })}
        <line x1={padding.left} x2={width - padding.right} y1={zeroY} y2={zeroY} stroke="#94a3b8" strokeDasharray="4 4" />

        {series.map((item) => {
          const points = item.values.map((value, index) => {
            const x = padding.left + (item.values.length === 1 ? plotWidth / 2 : (index / (item.values.length - 1)) * plotWidth)
            const y = padding.top + ((maxValue - value) / span) * plotHeight
            return { x, y }
          })
          const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')

          return (
            <g key={item.participantId}>
              <path d={path} fill="none" stroke={item.color} strokeWidth="2.5" />
              {points.slice(-1).map((point) => (
                <circle key={`${item.participantId}-${point.x}`} cx={point.x} cy={point.y} r="4" fill={item.color} />
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readSavedSession())
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [summary, setSummary] = useState<SummaryStats>(fallbackSummary)
  const [records, setRecords] = useState<RecordListItem[]>([])
  const [recordTotal, setRecordTotal] = useState(0)
  const [recordLimit, setRecordLimit] = useState(30)
  const [pendingRecords, setPendingRecords] = useState<RecordListItem[]>([])
  const [myRecords, setMyRecords] = useState<RecordListItem[]>([])
  const [myRecordTotal, setMyRecordTotal] = useState(0)
  const [deletedRecords, setDeletedRecords] = useState<RecordListItem[]>([])
  const [deletedRecordTotal, setDeletedRecordTotal] = useState(0)
  const [deletedRecordMessage, setDeletedRecordMessage] = useState<string | null>(null)
  const [deletedRecordError, setDeletedRecordError] = useState<string | null>(null)
  const [restoringRecordId, setRestoringRecordId] = useState<number | null>(null)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [downloadingBackup, setDownloadingBackup] = useState<string | null>(null)
  const [userStats, setUserStats] = useState<UserStatsItem[]>([])
  const [recordStats, setRecordStats] = useState<RecordStatsResponse>(fallbackRecordStats)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [expandedAnnouncementIds, setExpandedAnnouncementIds] = useState<Set<number>>(new Set())
  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementPayload>({ title: '', version: '', content: '' })
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null)
  const [announcementMessage, setAnnouncementMessage] = useState<string | null>(null)
  const [announcementError, setAnnouncementError] = useState<string | null>(null)
  const [savingAnnouncement, setSavingAnnouncement] = useState(false)
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [appUserDrafts, setAppUserDrafts] = useState<Record<number, AppUserDraft>>({})
  const [newAppUser, setNewAppUser] = useState<AppUserCreatePayload>({
    username: '',
    display_name: '',
    password: '',
    role: 'viewer',
    is_active: true,
  })
  const [userManageMessage, setUserManageMessage] = useState<string | null>(null)
  const [userManageError, setUserManageError] = useState<string | null>(null)
  const [savingAppUserId, setSavingAppUserId] = useState<number | 'new' | null>(null)
  const [amountPresets, setAmountPresets] = useState<AmountPreset[]>([])
  const [senderDefaultAmounts, setSenderDefaultAmounts] = useState<Record<string, string>>(() => readSenderDefaults())
  const [selectedTrendUserIds, setSelectedTrendUserIds] = useState<Set<number>>(new Set())
  const [selectedStatsUserId, setSelectedStatsUserId] = useState('')
  const [selectedRecordStatsUserId, setSelectedRecordStatsUserId] = useState('')
  const [savingAvatarParticipantId, setSavingAvatarParticipantId] = useState<number | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null)
  const [entryTime, setEntryTime] = useState(currentDateTimeLocal())
  const [senderId, setSenderId] = useState('')
  const [totalAmount, setTotalAmount] = useState('10')
  const [note, setNote] = useState('')
  const [entryClaims, setEntryClaims] = useState<EntryClaim[]>([newClaim(), newClaim(), newClaim(), newClaim()])
  const [entryMessage, setEntryMessage] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [savingEntry, setSavingEntry] = useState(false)
  const [newParticipantName, setNewParticipantName] = useState('')
  const [participantMessage, setParticipantMessage] = useState<string | null>(null)
  const [participantError, setParticipantError] = useState<string | null>(null)
  const [savingParticipant, setSavingParticipant] = useState(false)
  const [recordSearch, setRecordSearch] = useState('')
  const [recordSenderFilter, setRecordSenderFilter] = useState('')
  const [recordReceiverFilter, setRecordReceiverFilter] = useState('')
  const [recordStatusFilter, setRecordStatusFilter] = useState('approved')
  const [recordDateFrom, setRecordDateFrom] = useState('')
  const [recordDateTo, setRecordDateTo] = useState('')
  const [recordEditMode, setRecordEditMode] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RecordDetail | null>(null)
  const [recordDraftTime, setRecordDraftTime] = useState('')
  const [recordDraftSenderId, setRecordDraftSenderId] = useState('')
  const [recordDraftTotal, setRecordDraftTotal] = useState('10')
  const [recordDraftNote, setRecordDraftNote] = useState('')
  const [recordDraftStatus, setRecordDraftStatus] = useState<'approved' | 'pending' | 'rejected'>('approved')
  const [recordDraftClaims, setRecordDraftClaims] = useState<EntryClaim[]>([])
  const [recordMessage, setRecordMessage] = useState<string | null>(null)
  const [recordError, setRecordError] = useState<string | null>(null)
  const [reviewMessage, setReviewMessage] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewingRecordId, setReviewingRecordId] = useState<number | null>(null)
  const [savingRecord, setSavingRecord] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const currentUser = authSession?.user ?? null
  const currentRole = currentUser?.role ?? 'viewer'
  const isAdmin = currentRole === 'admin'

  const loadDashboardData = useCallback(async () => {
    const [
      summaryData,
      recordData,
      pendingRecordData,
      deletedRecordData,
      backupData,
      myRecordData,
      userStatsData,
      recordStatsData,
      announcementData,
      trendData,
      participantData,
      presetData,
      appUserData,
    ] = await Promise.all([
      getSummaryStats(),
      getRecentRecords(30),
      isAdmin ? getRecords({ status: 'pending', limit: 100 }) : Promise.resolve({ items: [], total: 0 }),
      isAdmin ? getDeletedRecords({ limit: 50 }) : Promise.resolve({ items: [], total: 0 }),
      isAdmin ? getBackups() : Promise.resolve([]),
      getMyRecords({ limit: 10 }),
      getUserStats(),
      getRecordStats(),
      getAnnouncements(),
      getTrendPoints(),
      getParticipants(),
      getAmountPresets(),
      isAdmin ? getAppUsers() : Promise.resolve([]),
    ])

    setSummary(summaryData)
    setRecords(recordData.items)
    setRecordTotal(recordData.total)
    setPendingRecords(pendingRecordData.items)
    setDeletedRecords(deletedRecordData.items)
    setDeletedRecordTotal(deletedRecordData.total)
    setBackups(backupData)
    setMyRecords(myRecordData.items)
    setMyRecordTotal(myRecordData.total)
    setUserStats(userStatsData)
    setRecordStats(recordStatsData)
    setAnnouncements(announcementData)
    setExpandedAnnouncementIds((current) => (current.size ? current : new Set(announcementData[0] ? [announcementData[0].id] : [])))
    setTrendPoints(trendData)
    setParticipants(participantData)
    setAmountPresets(presetData)
    setAppUsers(appUserData)
    setAppUserDrafts(
      Object.fromEntries(
        appUserData.map((user) => [
          user.id,
          {
            displayName: user.display_name,
            role: user.role,
            isActive: user.is_active,
            password: '',
          },
        ]),
      ),
    )
    setSelectedTrendUserIds((current) => (current.size ? current : new Set(userStatsData.map((item) => item.participant_id))))
    setSenderId((current) => current || String(participantData[0]?.id ?? ''))
  }, [isAdmin])

  async function loadRecordList() {
    const data = await getRecords({
      limit: recordLimit,
      status: isAdmin ? recordStatusFilter || undefined : 'approved',
      senderId: recordSenderFilter || undefined,
      receiverId: recordReceiverFilter || undefined,
      search: recordSearch || undefined,
      dateFrom: recordDateFrom ? new Date(recordDateFrom).toISOString() : undefined,
      dateTo: recordDateTo ? new Date(`${recordDateTo}T23:59:59`).toISOString() : undefined,
    })
    setRecords(data.items)
    setRecordTotal(data.total)
  }

  async function loadPendingRecords() {
    const data = await getRecords({ status: 'pending', limit: 100 })
    setPendingRecords(data.items)
  }

  async function loadDeletedRecords() {
    const data = await getDeletedRecords({ limit: 50 })
    setDeletedRecords(data.items)
    setDeletedRecordTotal(data.total)
  }

  async function loadBackups() {
    const data = await getBackups()
    setBackups(data)
  }

  async function handleCreateBackup() {
    setBackupMessage(null)
    setBackupError(null)
    try {
      setCreatingBackup(true)
      const backup = await createBackup()
      setBackupMessage(`备份已创建：${backup.filename}`)
      await loadBackups()
    } catch {
      setBackupError('创建备份失败，请稍后重试或在服务器上执行备份脚本。')
    } finally {
      setCreatingBackup(false)
    }
  }

  async function handleDownloadBackup(filename: string) {
    setBackupMessage(null)
    setBackupError(null)
    try {
      setDownloadingBackup(filename)
      const blob = await downloadBackup(filename)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      setBackupError('下载备份失败，请确认登录状态和后端连接。')
    } finally {
      setDownloadingBackup(null)
    }
  }

  async function loadMyRecords() {
    const data = await getMyRecords({ limit: 10 })
    setMyRecords(data.items)
    setMyRecordTotal(data.total)
  }

  async function handleLogin() {
    setLoginError(null)
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError('请输入用户名和密码。')
      return
    }

    try {
      setLoggingIn(true)
      const session = await login(loginUsername.trim(), loginPassword)
      setAuthToken(session.token)
      window.localStorage.setItem(savedUserKey, JSON.stringify(session))
      setAuthSession(session)
      setActiveView('dashboard')
      setLoginPassword('')
    } catch {
      setLoginError('用户名或密码不正确。')
    } finally {
      setLoggingIn(false)
    }
  }

  function handleLogout() {
    window.localStorage.removeItem(savedUserKey)
    setAuthToken(null)
    setAuthSession(null)
    setActiveView('dashboard')
    setSelectedRecord(null)
  }

  async function createLoginAccount() {
    setUserManageMessage(null)
    setUserManageError(null)

    if (!newAppUser.username.trim() || !newAppUser.display_name.trim() || !newAppUser.password) {
      setUserManageError('新增账号需要填写用户名、显示名称和初始密码。')
      return
    }

    try {
      setSavingAppUserId('new')
      await createAppUser({
        ...newAppUser,
        username: newAppUser.username.trim(),
        display_name: newAppUser.display_name.trim(),
      })
      setNewAppUser({ username: '', display_name: '', password: '', role: 'viewer', is_active: true })
      setUserManageMessage('登录账号已新增。')
      await loadDashboardData()
    } catch {
      setUserManageError('新增账号失败，请确认用户名没有重复。')
    } finally {
      setSavingAppUserId(null)
    }
  }

  async function saveLoginAccount(user: AppUser) {
    const draft = appUserDrafts[user.id]
    if (!draft) return

    setUserManageMessage(null)
    setUserManageError(null)
    if (!draft.displayName.trim()) {
      setUserManageError('显示名称不能为空。')
      return
    }

    const payload: AppUserUpdatePayload = {
      display_name: draft.displayName.trim(),
      role: draft.role,
      is_active: draft.isActive,
    }
    if (draft.password) {
      payload.password = draft.password
    }

    try {
      setSavingAppUserId(user.id)
      const updated = await updateAppUser(user.id, payload)
      setAppUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setAppUserDrafts((current) => ({
        ...current,
        [updated.id]: {
          displayName: updated.display_name,
          role: updated.role,
          isActive: updated.is_active,
          password: '',
        },
      }))
      if (currentUser?.id === updated.id) {
        const nextSession = { user: updated, token: authSession?.token ?? '' }
        window.localStorage.setItem(savedUserKey, JSON.stringify(nextSession))
        setAuthSession(nextSession)
      }
      setUserManageMessage(draft.password ? '账号信息和密码已更新。' : '账号信息已更新。')
    } catch {
      setUserManageError('保存账号失败。')
    } finally {
      setSavingAppUserId(null)
    }
  }

  async function addParticipant() {
    setParticipantMessage(null)
    setParticipantError(null)
    if (!newParticipantName.trim()) {
      setParticipantError('请输入参与者名称。')
      return
    }

    try {
      setSavingParticipant(true)
      await createParticipant(newParticipantName.trim())
      setNewParticipantName('')
      setParticipantMessage('参与者已新增，可用于发包和抢包选择。')
      await loadDashboardData()
    } catch {
      setParticipantError('新增参与者失败，请确认名称没有重复。')
    } finally {
      setSavingParticipant(false)
    }
  }

  async function handleAvatarFile(participant: Participant, file: File | undefined) {
    if (!file) return
    setParticipantMessage(null)
    setParticipantError(null)

    try {
      const sourceUrl = await readImageFile(file)
      setAvatarCrop({
        participant,
        sourceUrl,
        imageWidth: 0,
        imageHeight: 0,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        dragging: false,
        dragStartX: 0,
        dragStartY: 0,
        dragOriginX: 0,
        dragOriginY: 0,
      })
    } catch {
      setParticipantError('读取图片失败，请确认选择的是图片文件。')
    }
  }

  function clampAvatarOffset(crop: Pick<AvatarCropState, 'imageWidth' | 'imageHeight' | 'scale' | 'offsetX' | 'offsetY'>) {
    const displayWidth = crop.imageWidth * crop.scale
    const displayHeight = crop.imageHeight * crop.scale
    const maxX = Math.max(0, (displayWidth - avatarCropPreviewSize) / 2)
    const maxY = Math.max(0, (displayHeight - avatarCropPreviewSize) / 2)
    return {
      offsetX: clamp(crop.offsetX, -maxX, maxX),
      offsetY: clamp(crop.offsetY, -maxY, maxY),
    }
  }

  function initializeAvatarCrop(width: number, height: number) {
    setAvatarCrop((current) => {
      if (!current) return current
      const minScale = Math.max(avatarCropPreviewSize / width, avatarCropPreviewSize / height)
      return {
        ...current,
        imageWidth: width,
        imageHeight: height,
        scale: minScale,
        offsetX: 0,
        offsetY: 0,
      }
    })
  }

  function updateAvatarCropScale(nextScale: number) {
    setAvatarCrop((current) => {
      if (!current || !current.imageWidth || !current.imageHeight) return current
      const minScale = Math.max(avatarCropPreviewSize / current.imageWidth, avatarCropPreviewSize / current.imageHeight)
      const scale = clamp(nextScale, minScale, minScale * 4)
      const offsets = clampAvatarOffset({ ...current, scale })
      return { ...current, scale, ...offsets }
    })
  }

  async function confirmAvatarCrop() {
    if (!avatarCrop || !avatarCrop.imageWidth || !avatarCrop.imageHeight) return

    try {
      setSavingAvatarParticipantId(avatarCrop.participant.id)
      const image = new Image()
      image.src = avatarCrop.sourceUrl
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Image load failed'))
      })

      const displayWidth = avatarCrop.imageWidth * avatarCrop.scale
      const displayHeight = avatarCrop.imageHeight * avatarCrop.scale
      const left = avatarCropPreviewSize / 2 - displayWidth / 2 + avatarCrop.offsetX
      const top = avatarCropPreviewSize / 2 - displayHeight / 2 + avatarCrop.offsetY
      const sourceX = Math.max(0, -left / avatarCrop.scale)
      const sourceY = Math.max(0, -top / avatarCrop.scale)
      const sourceSize = avatarCropPreviewSize / avatarCrop.scale
      const canvas = document.createElement('canvas')
      canvas.width = avatarOutputSize
      canvas.height = avatarOutputSize
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas is not available')

      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, avatarOutputSize, avatarOutputSize)
      const avatarDataUrl = canvas.toDataURL('image/jpeg', 0.88)
      const updated = await updateParticipantAvatar(avatarCrop.participant.id, avatarDataUrl)
      setParticipants((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setParticipantMessage(`${avatarCrop.participant.name} 的头像已更新。`)
      setAvatarCrop(null)
      await loadDashboardData()
    } catch {
      setParticipantError('头像保存失败，请重新选择图片。')
    } finally {
      setSavingAvatarParticipantId(null)
    }
  }

  async function clearAvatar(participant: Participant) {
    setParticipantMessage(null)
    setParticipantError(null)

    try {
      setSavingAvatarParticipantId(participant.id)
      const updated = await updateParticipantAvatar(participant.id, null)
      setParticipants((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setParticipantMessage(`${participant.name} 的头像已清空。`)
      await loadDashboardData()
    } catch {
      setParticipantError('清空头像失败，请稍后重试。')
    } finally {
      setSavingAvatarParticipantId(null)
    }
  }

  function resetAnnouncementDraft() {
    setAnnouncementDraft({ title: '', version: '', content: '' })
    setEditingAnnouncementId(null)
    setAnnouncementError(null)
    setAnnouncementMessage(null)
  }

  function editAnnouncement(announcement: Announcement) {
    setAnnouncementDraft({
      title: announcement.title,
      version: announcement.version,
      content: announcement.content,
    })
    setEditingAnnouncementId(announcement.id)
    setAnnouncementError(null)
    setAnnouncementMessage(null)
    setExpandedAnnouncementIds((current) => new Set(current).add(announcement.id))
  }

  function toggleAnnouncement(announcementId: number) {
    setExpandedAnnouncementIds((current) => {
      const next = new Set(current)
      if (next.has(announcementId)) {
        next.delete(announcementId)
      } else {
        next.add(announcementId)
      }
      return next
    })
  }

  async function saveAnnouncement() {
    setAnnouncementMessage(null)
    setAnnouncementError(null)

    if (!announcementDraft.title.trim() || !announcementDraft.version.trim() || !announcementDraft.content.trim()) {
      setAnnouncementError('标题、版本号和更新内容都需要填写。')
      return
    }

    try {
      setSavingAnnouncement(true)
      const payload = {
        title: announcementDraft.title.trim(),
        version: announcementDraft.version.trim(),
        content: announcementDraft.content.trim(),
      }
      const saved = editingAnnouncementId
        ? await updateAnnouncement(editingAnnouncementId, payload)
        : await createAnnouncement(payload)
      const nextAnnouncements = await getAnnouncements()
      setAnnouncements(nextAnnouncements)
      setExpandedAnnouncementIds((current) => new Set(current).add(saved.id))
      setAnnouncementDraft({ title: '', version: '', content: '' })
      setEditingAnnouncementId(null)
      setAnnouncementMessage(editingAnnouncementId ? '更新公告已保存。' : '更新公告已发布。')
    } catch {
      setAnnouncementError('保存更新公告失败，请稍后重试。')
    } finally {
      setSavingAnnouncement(false)
    }
  }

  useEffect(() => {
    let active = true

    async function load() {
      if (!currentUser) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        await loadDashboardData()
        if (active) {
          setApiError(null)
        }
      } catch (error) {
        if (active) {
          setApiError(error instanceof Error && error.message.includes('401') ? '登录已过期，请重新登录。' : '后端暂未连接，当前页面只显示空状态。')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      active = false
    }
  }, [currentUser, loadDashboardData])

  useEffect(() => {
    function handleAuthExpired() {
      window.localStorage.removeItem(savedUserKey)
      setAuthSession(null)
      setActiveView('dashboard')
      setApiError('登录已过期，请重新登录。')
    }

    window.addEventListener('red-packet-auth-expired', handleAuthExpired)
    return () => window.removeEventListener('red-packet-auth-expired', handleAuthExpired)
  }, [])

  const summaryItems: SummaryItem[] = useMemo(
    () => [
      {
        label: '红包记录数',
        value: summary.record_count.toLocaleString(),
        helper: '仅统计已审核通过的记录',
        icon: BookOpen,
      },
      {
        label: '参与用户',
        value: summary.participant_count.toLocaleString(),
        helper: '发包人与抢包人来自预设名单',
        icon: Users,
      },
      {
        label: '累计发包金额',
        value: formatMoney(summary.total_sent_amount),
        helper: '按红包总额汇总',
        icon: Gift,
      },
      {
        label: '累计抢包金额',
        value: formatMoney(summary.total_claimed_amount),
        helper: `${summary.pending_count} 条记录等待审核`,
        icon: CircleDollarSign,
      },
    ],
    [summary],
  )

  const latestTrendByUser = buildLatestTrendByUser(trendPoints)
  const selectedStatsUser = selectedStatsUserId ? userStats.find((item) => String(item.participant_id) === selectedStatsUserId) : undefined
  const selectedRecordStatsUser = selectedRecordStatsUserId
    ? recordStats.personal.find((item) => String(item.participant.id) === selectedRecordStatsUserId)
    : undefined
  const maxAbsPnl = Math.max(1, ...userStats.map((item) => Math.abs(toNumber(item.pnl_amount))))
  const claimTotal = sumClaimAmounts(entryClaims)
  const amountMismatch = Math.abs(claimTotal - toNumber(totalAmount)) > 0.001

  function getUserRank(user: UserStatsItem, metric: keyof UserStatsItem | 'send_ratio_number') {
    const value = metric === 'send_ratio_number' ? toRatioNumber(user.send_ratio) : toNumber(String(user[metric]))
    const rank = 1 + userStats.filter((item) => {
      const otherValue = metric === 'send_ratio_number' ? toRatioNumber(item.send_ratio) : toNumber(String(item[metric]))
      return otherValue > value
    }).length
    return `当前第 ${rank} / ${userStats.length}`
  }

  function renderPersonalStats(user: UserStatsItem) {
    const participant = participants.find((item) => item.id === user.participant_id) ?? {
      id: user.participant_id,
      name: user.name,
      avatar_data_url: null,
      is_active: true,
    }
    const metrics = [
      { label: '发包数', value: user.send_count, rank: getUserRank(user, 'send_count'), color: 'bg-violet-500' },
      { label: '抢包数', value: user.receive_count, rank: getUserRank(user, 'receive_count'), color: 'bg-violet-500' },
      { label: '发包金额', value: formatMoney(user.send_amount), raw: toNumber(user.send_amount), rank: getUserRank(user, 'send_amount'), color: 'bg-blue-500' },
      { label: '抢包金额', value: formatMoney(user.receive_amount), raw: toNumber(user.receive_amount), rank: getUserRank(user, 'receive_amount'), color: 'bg-emerald-500' },
      {
        label: '平均每包',
        value: formatMoney(user.average_receive_amount),
        raw: toNumber(user.average_receive_amount),
        rank: getUserRank(user, 'average_receive_amount'),
        color: 'bg-amber-500',
      },
      {
        label: '盈亏',
        value: formatMoney(user.pnl_amount),
        raw: Math.abs(toNumber(user.pnl_amount)),
        rank: getUserRank(user, 'pnl_amount'),
        color: toNumber(user.pnl_amount) >= 0 ? 'bg-emerald-500' : 'bg-red-500',
      },
    ]
    const maxMetric = Math.max(1, ...metrics.map((item) => Number(item.raw ?? item.value) || 0))

    return (
      <div className="border-b border-slate-100 p-5">
        <div className="mb-5 flex items-center gap-4">
          <AvatarBubble participant={participant} size="xl" />
          <div>
            <h3 className="text-lg font-semibold">{user.name}</h3>
            <p className="mt-1 text-sm text-slate-500">个人累计统计与排名</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: '发包金额', value: formatMoney(user.send_amount), rank: getUserRank(user, 'send_amount') },
            { label: '抢包金额', value: formatMoney(user.receive_amount), rank: getUserRank(user, 'receive_amount') },
            { label: '盈亏', value: formatMoney(user.pnl_amount), rank: getUserRank(user, 'pnl_amount') },
            { label: '平均每包', value: formatMoney(user.average_receive_amount), rank: getUserRank(user, 'average_receive_amount') },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{item.value}</p>
              <p className="mt-2 text-xs text-slate-500">{item.rank}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 p-4">
          <h3 className="text-sm font-semibold">个人详细指标</h3>
          <div className="mt-4 space-y-4">
            {metrics.map((item) => {
              const width = `${Math.max(3, ((Number(item.raw ?? item.value) || 0) / maxMetric) * 100)}%`

              return (
                <div key={item.label} className="grid gap-2 md:grid-cols-[92px_1fr_180px] md:items-center">
                  <span className="text-sm text-slate-600">{item.label}</span>
                  <div className="h-7 rounded-lg bg-slate-100 p-1">
                    <div className={`h-full rounded-md ${item.color}`} style={{ width }} />
                  </div>
                  <span className="text-sm text-slate-600 md:text-right">
                    {item.value} <span className="text-slate-400">{item.rank}</span>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-5 text-sm text-slate-500">
            对局发包率：{user.send_ratio}（{getUserRank(user, 'send_ratio_number')}）
          </p>
        </div>
      </div>
    )
  }

  function renderClaimLine(item: ClaimRecordStat | null, emptyText = '暂无记录') {
    if (!item) return <span>{emptyText}</span>
    return (
      <span>
        {item.participant.name} 领到 {item.sender.name} 的 {formatMoney(item.amount)}
      </span>
    )
  }

  function renderCounterpartyLine(item: CounterpartyRecordStat | null, prefix: string) {
    if (!item) return <span>暂无记录</span>
    return (
      <span>
        {prefix} {item.participant.name}：{formatMoney(item.amount)}
      </span>
    )
  }

  function renderTopClaimCard(title: string, items: ClaimRecordStat[], tone: 'best' | 'low') {
    const champion = items[0]
    const accent = tone === 'best' ? 'text-red-700' : 'text-blue-700'
    const bg = tone === 'best' ? 'bg-red-50 ring-red-100' : 'bg-blue-50 ring-blue-100'

    return (
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            {champion ? (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <AvatarBubble participant={champion.participant} size="lg" />
                  <div>
                    <p className="font-semibold">{champion.participant.name}</p>
                    <p className={`mt-1 text-2xl font-semibold ${accent}`}>{formatMoney(champion.amount)}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">领到 {champion.sender.name} 的包</p>
              </>
            ) : (
              <p className="mt-5 text-sm text-slate-500">暂无记录</p>
            )}
          </div>
          <div className={`flex size-10 items-center justify-center rounded-lg ring-1 ${bg}`}>
            <Medal className="size-5" />
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm text-slate-500">
          <p>第二名：{renderClaimLine(items[1] ?? null)}</p>
          <p>第三名：{renderClaimLine(items[2] ?? null)}</p>
        </div>
      </article>
    )
  }

  function renderTopStreakCard(title: string, items: StreakRecordStat[], helper: string, tone: 'win' | 'loss') {
    const champion = items[0]
    const accent = tone === 'win' ? 'text-emerald-700' : 'text-amber-700'
    const bg = tone === 'win' ? 'bg-emerald-50 ring-emerald-100' : 'bg-amber-50 ring-amber-100'

    return (
      <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">{title}</p>
            {champion ? (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <AvatarBubble participant={champion.participant} size="lg" />
                  <div>
                    <p className="font-semibold">{champion.participant.name}</p>
                    <p className={`mt-1 text-2xl font-semibold ${accent}`}>{champion.count} 场</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-500">{helper}</p>
              </>
            ) : (
              <p className="mt-5 text-sm text-slate-500">暂无记录</p>
            )}
          </div>
          <div className={`flex size-10 items-center justify-center rounded-lg ring-1 ${bg}`}>
            <Trophy className="size-5" />
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm text-slate-500">
          <p>第二名：{items[1] ? `${items[1].participant.name}，${items[1].count} 场` : '暂无记录'}</p>
          <p>第三名：{items[2] ? `${items[2].participant.name}，${items[2].count} 场` : '暂无记录'}</p>
        </div>
      </article>
    )
  }

  function renderRecordStatsPersonal(item: PersonalRecordStats) {
    const cards = [
      { label: '最大红包', value: item.max_claim ? formatMoney(item.max_claim.amount) : '-', detail: item.max_claim ? `来自 ${item.max_claim.sender.name}` : '暂无记录' },
      { label: '最小红包', value: item.min_claim ? formatMoney(item.min_claim.amount) : '-', detail: item.min_claim ? `来自 ${item.min_claim.sender.name}` : '暂无记录' },
      { label: '最多连胜', value: `${item.max_win_streak} 场`, detail: '参与抢包但未发包的最长连续场次' },
      { label: '最多连败', value: `${item.max_loss_streak} 场`, detail: '连续发包的最长场次' },
      { label: '吃米最多', value: item.top_received_from ? formatMoney(item.top_received_from.amount) : '-', detail: renderCounterpartyLine(item.top_received_from, '来自') },
      { label: '送米最多', value: item.top_sent_to ? formatMoney(item.top_sent_to.amount) : '-', detail: renderCounterpartyLine(item.top_sent_to, '送给') },
    ]

    return (
      <div className="border-t border-slate-100 p-5">
        <div className="flex items-center gap-4">
          <AvatarBubble participant={item.participant} size="xl" />
          <div>
            <h3 className="text-lg font-semibold">{item.participant.name}</h3>
            <p className="mt-1 text-sm text-slate-500">个人记录峰值与主要往来对象</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-semibold">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderRecordStats() {
    return (
      <>
        <section className="grid gap-5 xl:grid-cols-4">
          {renderTopClaimCard('最大红包', recordStats.max_claims, 'best')}
          {renderTopClaimCard('最大倒霉蛋', recordStats.min_claims, 'low')}
          {renderTopStreakCard('最大连胜', recordStats.max_win_streaks, '不发包的最长连续参与场次', 'win')}
          {renderTopStreakCard('最大连败', recordStats.max_loss_streaks, '连续发包的最长场次', 'loss')}
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">个人记录概览</h2>
                <p className="mt-1 text-sm text-slate-500">选择一个用户查看个人最大/最小红包、连胜连败和往来金额。</p>
              </div>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={selectedRecordStatsUserId}
                onChange={(event) => setSelectedRecordStatsUserId(event.target.value)}
              >
                <option value="">请选择一个用户</option>
                {recordStats.personal.map((item) => (
                  <option key={item.participant.id} value={item.participant.id}>
                    {item.participant.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedRecordStatsUser ? (
            renderRecordStatsPersonal(selectedRecordStatsUser)
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">请选择一个用户。</div>
          )}
        </section>
      </>
    )
  }

  function renderAnnouncements() {
    return (
      <div className="space-y-5">
        {isAdmin ? (
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold">{editingAnnouncementId ? '编辑更新公告' : '发布更新公告'}</h2>
              <p className="mt-1 text-sm text-slate-500">填写标题、版本号和更新内容，保存后所有用户都可以查看。</p>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">标题</span>
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                    value={announcementDraft.title}
                    onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))}
                    placeholder="例如：记录统计页面上线"
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-500">版本号</span>
                  <input
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                    value={announcementDraft.version}
                    onChange={(event) => setAnnouncementDraft((current) => ({ ...current, version: event.target.value }))}
                    placeholder="例如：v0.3.0"
                  />
                </label>
              </div>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">更新内容</span>
                <textarea
                  className="min-h-40 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={announcementDraft.content}
                  onChange={(event) => setAnnouncementDraft((current) => ({ ...current, content: event.target.value }))}
                  placeholder="每行写一条更新内容，普通用户展开公告后会看到这里的完整内容。"
                />
              </label>

              {announcementError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{announcementError}</div> : null}
              {announcementMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{announcementMessage}</div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {editingAnnouncementId ? (
                  <Button variant="outline" onClick={resetAnnouncementDraft} disabled={savingAnnouncement}>
                    取消编辑
                  </Button>
                ) : null}
                <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={saveAnnouncement} disabled={savingAnnouncement}>
                  {savingAnnouncement ? '保存中' : editingAnnouncementId ? '保存公告' : '发布公告'}
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">更新公告</h2>
            <p className="mt-1 text-sm text-slate-500">最新一条公告默认展开，其他公告可点击查看完整内容。</p>
          </div>

          {announcements.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">当前还没有更新公告。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {announcements.map((announcement, index) => {
                const expanded = expandedAnnouncementIds.has(announcement.id) || (expandedAnnouncementIds.size === 0 && index === 0)

                return (
                  <article key={announcement.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => toggleAnnouncement(announcement.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-950">{announcement.title}</h3>
                          <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700">{announcement.version}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">更新时间：{formatTime(announcement.updated_at)}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="xs" onClick={() => toggleAnnouncement(announcement.id)}>
                          {expanded ? '收起' : '展开'}
                        </Button>
                        {isAdmin ? (
                          <Button variant="outline" size="xs" onClick={() => editAnnouncement(announcement)}>
                            编辑
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {expanded ? (
                      <div className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        {announcement.content}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    )
  }

  function renderLogin() {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 text-slate-950">
        <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
              <Gift className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">红包履历统计</h1>
              <p className="mt-1 text-sm text-slate-500">登录后进入 Web 工作台</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">用户名</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleLogin()
                  }
                }}
                autoComplete="username"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">密码</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                type="password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleLogin()
                  }
                }}
                autoComplete="current-password"
              />
            </label>

            {loginError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</div> : null}

            <Button className="w-full bg-slate-950 text-white hover:bg-slate-800" onClick={handleLogin} disabled={loggingIn}>
              {loggingIn ? '登录中' : '登录'}
            </Button>
          </div>

          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
            普通用户只能查看首页、提交录入和查看已审核记录；管理员可以审核、管理用户和维护数据。
          </div>
        </section>
      </main>
    )
  }

  function toggleTrendUser(participantId: number) {
    setSelectedTrendUserIds((current) => {
      const next = new Set(current)
      if (next.has(participantId)) {
        next.delete(participantId)
      } else {
        next.add(participantId)
      }
      return next
    })
  }

  function resetEntryForm(keepPeople = true) {
    setEntryTime(currentDateTimeLocal())
    setTotalAmount(senderDefaultAmounts[senderId] ?? '10')
    setNote('')
    setEntryMessage(null)
    setEntryError(null)
    setEntryClaims((current) => {
      const base = keepPeople ? current : [newClaim(), newClaim(), newClaim(), newClaim()]
      return base.map((claim) => ({ ...claim, amount: '', participantId: keepPeople ? claim.participantId : '' }))
    })
  }

  function handleSenderChange(nextSenderId: string) {
    const previousSenderId = senderId
    setSenderId(nextSenderId)
    setTotalAmount(senderDefaultAmounts[nextSenderId] ?? '10')

    if (!previousSenderId || !nextSenderId) {
      return
    }

    setEntryClaims((current) =>
      current.map((claim) =>
        claim.participantId === nextSenderId ? { ...claim, participantId: previousSenderId } : claim,
      ),
    )
  }

  function focusNextAmountInput(index: number) {
    const next = document.querySelector<HTMLInputElement>(`[data-claim-amount-index="${index + 1}"]`)
    next?.focus()
    next?.select()
  }

  async function submitEntry() {
    setEntryMessage(null)
    setEntryError(null)

    const claims = entryClaims
      .filter((claim) => claim.participantId || claim.amount.trim())
      .map((claim) => ({
        participant_id: Number(claim.participantId),
        amount: claim.amount.trim(),
      }))

    if (!senderId) {
      setEntryError('请选择发包人。')
      return
    }
    if (claims.length === 0) {
      setEntryError('至少需要一条抢包明细。')
      return
    }
    if (claims.some((claim) => !claim.participant_id || !claim.amount)) {
      setEntryError('抢包明细需要同时选择用户并填写金额。')
      return
    }
    if (new Set(claims.map((claim) => claim.participant_id)).size !== claims.length) {
      setEntryError('同一个抢包人不能重复出现。')
      return
    }

    if (Math.abs(sumClaimAmounts(entryClaims) - toNumber(totalAmount)) > 0.001) {
      const confirmed = window.confirm(`红包总额为 ${formatMoney(totalAmount)}，抢包明细合计为 ¥${sumClaimAmounts(entryClaims).toFixed(2)}，仍然保存吗？`)
      if (!confirmed) {
        return
      }
    }

    const payload: RecordCreatePayload = {
      time: entryTime || undefined,
      sender_id: Number(senderId),
      total_amount: totalAmount,
      note,
      status: isAdmin ? 'approved' : 'pending',
      claims,
    }

    try {
      setSavingEntry(true)
      await createRecord(payload)
      setSenderDefaultAmounts((current) => {
        const next = { ...current, [senderId]: totalAmount }
        window.localStorage.setItem(senderDefaultsKey, JSON.stringify(next))
        return next
      })
      await loadDashboardData()
      await loadMyRecords()
      resetEntryForm(true)
      setEntryMessage(isAdmin ? '记录已保存，并已进入统计。' : '记录已提交，等待管理员审核后进入统计。')
    } catch {
      setEntryError('保存失败，请检查金额和用户选择。')
    } finally {
      setSavingEntry(false)
    }
  }

  async function openRecord(recordId: number) {
    setRecordMessage(null)
    setRecordError(null)
    try {
      const record = await getRecord(recordId)
      setSelectedRecord(record)
      setRecordEditMode(false)
      setRecordDraftTime(toDateTimeLocal(record.time))
      setRecordDraftSenderId(String(record.sender_id))
      setRecordDraftTotal(record.total_amount)
      setRecordDraftNote(record.note)
      setRecordDraftStatus(record.status as 'approved' | 'pending' | 'rejected')
      setRecordDraftClaims(
        record.claims.map((claim) => ({
          id: makeClientId(),
          participantId: String(claim.participant_id),
          amount: claim.amount,
        })),
      )
    } catch {
      setRecordError('读取记录详情失败。')
    }
  }

  async function saveSelectedRecord() {
    if (!isAdmin) {
      setRecordError('普通用户只能查看明细，不能修改记录。')
      return
    }
    if (!selectedRecord) return
    setRecordMessage(null)
    setRecordError(null)

    const claims = recordDraftClaims
      .filter((claim) => claim.participantId || claim.amount.trim())
      .map((claim) => ({
        participant_id: Number(claim.participantId),
        amount: claim.amount.trim(),
      }))

    if (!recordDraftSenderId || claims.length === 0 || claims.some((claim) => !claim.participant_id || !claim.amount)) {
      setRecordError('请完整填写发包人和抢包明细。')
      return
    }
    if (new Set(claims.map((claim) => claim.participant_id)).size !== claims.length) {
      setRecordError('同一个抢包人不能重复出现。')
      return
    }

    if (Math.abs(sumClaimAmounts(recordDraftClaims) - toNumber(recordDraftTotal)) > 0.001) {
      const confirmed = window.confirm(
        `红包总额为 ${formatMoney(recordDraftTotal)}，抢包明细合计为 ¥${sumClaimAmounts(recordDraftClaims).toFixed(2)}，仍然保存吗？`,
      )
      if (!confirmed) return
    }

    const payload: RecordCreatePayload = {
      time: recordDraftTime || undefined,
      sender_id: Number(recordDraftSenderId),
      total_amount: recordDraftTotal,
      note: recordDraftNote,
      status: recordDraftStatus,
      claims,
    }

    try {
      setSavingRecord(true)
      const updated = await updateRecord(selectedRecord.id, payload)
      setSelectedRecord(updated)
      setRecordMessage('记录已更新。')
      await loadDashboardData()
      await loadRecordList()
    } catch {
      setRecordError('更新失败，请检查记录内容。')
    } finally {
      setSavingRecord(false)
    }
  }

  async function deleteSelectedRecord() {
    if (!isAdmin) {
      setRecordError('普通用户只能查看明细，不能删除记录。')
      return
    }
    if (!selectedRecord) return
    const confirmation = window.prompt(
      `删除后无法在页面恢复。\n\n时间：${formatTime(selectedRecord.time)}\n发包人：${selectedRecord.sender_name}\n总额：${formatMoney(
        selectedRecord.total_amount,
      )}\n\n请输入“删除”确认。`,
    )
    if (confirmation !== '删除') return

    try {
      await deleteRecord(selectedRecord.id)
      setSelectedRecord(null)
      setRecordMessage(null)
      await loadDashboardData()
      await loadRecordList()
    } catch {
      setRecordError('删除失败。')
    }
  }

  async function reviewRecord(recordId: number, action: 'approve' | 'reject') {
    setReviewMessage(null)
    setReviewError(null)
    const confirmed = window.confirm(action === 'approve' ? '确认通过这条待审核记录吗？' : '确认驳回这条待审核记录吗？')
    if (!confirmed) return
    try {
      setReviewingRecordId(recordId)
      if (action === 'approve') {
        await approveRecord(recordId)
        setReviewMessage('记录已通过审核，并进入统计。')
      } else {
        await rejectRecord(recordId)
        setReviewMessage('记录已驳回。')
      }
      await loadDashboardData()
      await loadPendingRecords()
    } catch {
      setReviewError('审核操作失败。')
    } finally {
      setReviewingRecordId(null)
    }
  }

  async function restoreRecord(recordId: number) {
    setDeletedRecordMessage(null)
    setDeletedRecordError(null)
    try {
      setRestoringRecordId(recordId)
      await restoreDeletedRecord(recordId)
      setDeletedRecordMessage('记录已恢复。')
      await loadDashboardData()
      await loadDeletedRecords()
    } catch {
      setDeletedRecordError('恢复失败。')
    } finally {
      setRestoringRecordId(null)
    }
  }

  function renderSummaryCards() {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryItems.map((item) => {
          const Icon = item.icon

          return (
            <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-4 text-3xl font-semibold">{item.value}</p>
                </div>
                <div className="flex size-12 items-center justify-center rounded-lg bg-red-50 text-red-700">
                  <Icon className="size-6" />
                </div>
              </div>
              <p className="mt-5 text-sm text-slate-500">{item.helper}</p>
            </article>
          )
        })}
      </section>
    )
  }

  function renderDashboard() {
    return (
      <>
        {renderSummaryCards()}

        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">盈亏排行</h2>
              <p className="mt-1 text-sm text-slate-500">按当前累计盈亏排序。</p>
            </div>
            <BarChart3 className="size-5 text-slate-400" />
          </div>

          <div className="mt-5 space-y-4">
            {userStats.map((user) => {
              const pnl = toNumber(user.pnl_amount)
              const width = `${Math.max(12, (Math.abs(pnl) / maxAbsPnl) * 100)}%`
              const positive = pnl >= 0

              return (
                <div key={user.participant_id} className="grid gap-2 sm:grid-cols-[82px_1fr_78px] sm:items-center">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.send_ratio}</p>
                  </div>
                  <div className="h-8 rounded-lg bg-slate-100 p-1">
                    <div className={`h-full rounded-md ${positive ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width }} />
                  </div>
                  <div className={`text-right font-semibold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {positive ? '+' : ''}
                    {user.pnl_amount}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">全员统计</h2>
                <p className="mt-1 text-sm text-slate-500">选择一个用户查看个人概览。</p>
              </div>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={selectedStatsUserId}
                onChange={(event) => setSelectedStatsUserId(event.target.value)}
              >
                <option value="">全体</option>
                {userStats.map((user) => (
                  <option key={user.participant_id} value={user.participant_id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedStatsUser ? renderPersonalStats(selectedStatsUser) : null}
          {renderStatsTable()}
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">累计盈亏趋势</h2>
            <p className="mt-1 text-sm text-slate-500">选择一个或多个用户查看折线趋势。</p>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-[260px_1fr]">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">显示用户</p>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setSelectedTrendUserIds(new Set(userStats.map((item) => item.participant_id)))}
                >
                  全选
                </Button>
              </div>
              <div className="mt-3 grid gap-2">
                {latestTrendByUser.map((trend) => {
                  const selected = selectedTrendUserIds.has(trend.participant_id)

                  return (
                    <button
                      key={trend.participant_id}
                      type="button"
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                        selected
                          ? 'border-red-200 bg-white text-red-700'
                          : 'border-transparent bg-transparent text-slate-600 hover:bg-white'
                      }`}
                      onClick={() => toggleTrendUser(trend.participant_id)}
                    >
                      <span>{trend.participant_name}</span>
                      {selected ? <Check className="size-4" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <TrendLineChart trends={trendPoints} selectedIds={selectedTrendUserIds} />
          </div>
        </section>
      </>
    )
  }

  function renderStatsTable() {
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-5 py-3">用户</th>
              <th className="px-5 py-3">发包次数</th>
              <th className="px-5 py-3">发包金额</th>
              <th className="px-5 py-3">抢包次数</th>
              <th className="px-5 py-3">抢包金额</th>
              <th className="px-5 py-3">平均每包</th>
              <th className="px-5 py-3">盈亏</th>
              <th className="px-5 py-3">发包率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {userStats.map((user) => {
              const pnl = toNumber(user.pnl_amount)
              const positive = pnl >= 0

              return (
                <tr key={user.participant_id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium">{user.name}</td>
                  <td className="px-5 py-3">{user.send_count}</td>
                  <td className="px-5 py-3">{formatMoney(user.send_amount)}</td>
                  <td className="px-5 py-3">{user.receive_count}</td>
                  <td className="px-5 py-3">{formatMoney(user.receive_amount)}</td>
                  <td className="px-5 py-3">{formatMoney(user.average_receive_amount)}</td>
                  <td className={`px-5 py-3 font-semibold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {positive ? '+' : ''}
                    {formatMoney(user.pnl_amount)}
                  </td>
                  <td className="px-5 py-3">{user.send_ratio}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  function renderEntry() {
    return (
      <section className="grid gap-5 xl:grid-cols-[520px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">快速录入</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isAdmin ? '管理员录入会直接进入统计。' : '普通用户提交后进入审核，通过后才会进入统计。'}
            </p>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">时间</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  type="datetime-local"
                  value={entryTime}
                  onChange={(event) => setEntryTime(event.target.value)}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">发包人</span>
                <select
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={senderId}
                  onChange={(event) => handleSenderChange(event.target.value)}
                >
                  <option value="">请选择</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">红包总额</span>
              <div className="flex gap-2">
                <input
                  className="h-10 min-w-0 flex-1 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                />
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={totalAmount}
                  onChange={(event) => setTotalAmount(event.target.value)}
                >
                  {[{ id: 0, amount: '10', is_active: true }, ...amountPresets]
                    .filter((preset, index, array) => array.findIndex((item) => item.amount === preset.amount) === index)
                    .map((preset) => (
                      <option key={`${preset.id}-${preset.amount}`} value={preset.amount}>
                        ¥{preset.amount}
                      </option>
                    ))}
                </select>
              </div>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">备注</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="可选"
              />
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              人名来自预设用户名单，只能点击选择，避免同一个人出现多个写法。
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">抢包明细</span>
                <Button variant="outline" size="xs" onClick={() => setEntryClaims((current) => [...current, newClaim()])}>
                  <Plus className="size-3" />
                  加一行
                </Button>
              </div>

              {entryClaims.map((claim, index) => (
                <div key={claim.id} className="grid grid-cols-[1fr_112px_56px] gap-2">
                  <select
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                    value={claim.participantId}
                    onChange={(event) =>
                      setEntryClaims((current) =>
                        current.map((item) => (item.id === claim.id ? { ...item, participantId: event.target.value } : item)),
                      )
                    }
                  >
                    <option value="">请选择</option>
                    {participants.map((participant) => (
                      <option key={participant.id} value={participant.id}>
                        {participant.name}
                      </option>
                    ))}
                  </select>
                  <input
                    data-claim-amount-index={index}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-right text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                    value={claim.amount}
                    onChange={(event) =>
                      setEntryClaims((current) =>
                        current.map((item) => (item.id === claim.id ? { ...item, amount: event.target.value } : item)),
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        focusNextAmountInput(index)
                      }
                    }}
                    placeholder="0.00"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEntryClaims((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== claim.id)))}
                  >
                    删除
                  </Button>
                </div>
              ))}
            </div>

            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                amountMismatch ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              明细合计 ¥{claimTotal.toFixed(2)}
              {amountMismatch ? `，与总额相差 ¥${Math.abs(toNumber(totalAmount) - claimTotal).toFixed(2)}，保存前请确认。` : '，与总额一致。'}
            </div>

            {entryError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{entryError}</div> : null}
            {entryMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{entryMessage}</div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => resetEntryForm(false)}>
                清空当前输入
              </Button>
              <Button className="flex-1 bg-slate-950 text-white hover:bg-slate-800" onClick={submitEntry} disabled={savingEntry}>
                {savingEntry ? '保存中' : isAdmin ? '保存并进入统计' : '提交审核'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">录入说明</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {isAdmin
              ? '管理员录入保存为已审核记录，因此会立刻进入统计。'
              : '普通用户可以协助录入，但记录会先保存为待审核，管理员通过后才会进入首页统计。'}
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            当前名单共有 {participants.length} 人，金额预设 {amountPresets.map((preset) => `¥${preset.amount}`).join(' / ') || '暂无'}。
          </div>

          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold">我的提交</h3>
              <Button variant="outline" size="xs" onClick={loadMyRecords}>
                刷新
              </Button>
            </div>
            <div className="divide-y divide-slate-100">
              {myRecords.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500">暂无由当前账号提交的记录。</div>
              ) : (
                myRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-slate-50"
                    onClick={() => openRecord(record.id)}
                  >
                    <span>
                      <span className="font-medium">{record.sender_name}</span>
                      <span className="ml-2 text-slate-500">{formatTime(record.time)}</span>
                    </span>
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                        record.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : record.status === 'pending'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {formatStatus(record.status)}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">共 {myRecordTotal} 条</div>
          </div>
        </div>
      </section>
    )
  }

  function renderRecordEditor() {
    if (!selectedRecord) {
      return (
        <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          单击左侧任意记录查看明细。管理员可编辑和删除，普通用户只查看。
        </aside>
      )
    }

    const draftClaimTotal = sumClaimAmounts(recordDraftClaims)
    const draftMismatch = Math.abs(draftClaimTotal - toNumber(recordDraftTotal)) > 0.001
    const canEditRecord = isAdmin && recordEditMode

    return (
      <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">记录明细</h2>
              <p className="mt-1 text-sm text-slate-500">ID #{selectedRecord.id}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
              关闭
            </Button>
            {isAdmin ? (
              <Button variant={recordEditMode ? 'outline' : 'default'} size="sm" onClick={() => setRecordEditMode((current) => !current)}>
                {recordEditMode ? '退出编辑' : '编辑'}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 p-5">
          {recordError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{recordError}</div> : null}
          {recordMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{recordMessage}</div>
          ) : null}

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">时间</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              type="datetime-local"
              value={recordDraftTime}
              onChange={(event) => setRecordDraftTime(event.target.value)}
              disabled={!canEditRecord}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">发包人</span>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordDraftSenderId}
                onChange={(event) => setRecordDraftSenderId(event.target.value)}
                disabled={!canEditRecord}
              >
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">状态</span>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordDraftStatus}
                onChange={(event) => setRecordDraftStatus(event.target.value as 'approved' | 'pending' | 'rejected')}
                disabled={!canEditRecord}
              >
                <option value="approved">已审核</option>
                <option value="pending">待审核</option>
                <option value="rejected">已驳回</option>
              </select>
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">红包总额</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={recordDraftTotal}
              onChange={(event) => setRecordDraftTotal(event.target.value)}
              disabled={!canEditRecord}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">备注</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={recordDraftNote}
              onChange={(event) => setRecordDraftNote(event.target.value)}
              disabled={!canEditRecord}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">抢包明细</span>
              {canEditRecord ? (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setRecordDraftClaims((current) => [...current, newClaim()])}
                >
                  <Plus className="size-3" />
                  加一行
                </Button>
              ) : null}
            </div>

            {recordDraftClaims.map((claim) => (
              <div key={claim.id} className={`grid gap-2 ${canEditRecord ? 'grid-cols-[1fr_92px_56px]' : 'grid-cols-[1fr_92px]'}`}>
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={claim.participantId}
                  onChange={(event) =>
                    setRecordDraftClaims((current) =>
                      current.map((item) => (item.id === claim.id ? { ...item, participantId: event.target.value } : item)),
                    )
                  }
                  disabled={!canEditRecord}
                >
                  <option value="">请选择</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-right text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={claim.amount}
                  onChange={(event) =>
                    setRecordDraftClaims((current) =>
                      current.map((item) => (item.id === claim.id ? { ...item, amount: event.target.value } : item)),
                    )
                  }
                  disabled={!canEditRecord}
                />
                {canEditRecord ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setRecordDraftClaims((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== claim.id)))
                    }
                  >
                    删除
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              draftMismatch ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            明细合计 ¥{draftClaimTotal.toFixed(2)}
            {draftMismatch ? '，与总额不一致。' : '，与总额一致。'}
          </div>

          {canEditRecord ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={deleteSelectedRecord}>
                删除记录
              </Button>
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={saveSelectedRecord} disabled={savingRecord}>
                {savingRecord ? '保存中' : '保存修改'}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {isAdmin ? '当前为查看模式，点击“编辑”后可修改或删除。' : '当前账号为只读权限，可查看记录明细，不能修改或删除。'}
            </div>
          )}
        </div>
      </aside>
    )
  }

  function renderRecords() {
    return (
      <section className="grid gap-5 xl:grid-cols-[1fr_460px]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">记录列表</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isAdmin ? '单击记录可查看明细并编辑。' : '普通用户只能查看已审核记录和明细。'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadRecordList}>
                筛选
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <input
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordSearch}
                onChange={(event) => setRecordSearch(event.target.value)}
                placeholder="搜索发包人、备注或旧记录 ID"
              />
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordSenderFilter}
                onChange={(event) => setRecordSenderFilter(event.target.value)}
              >
                <option value="">全部发包人</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordReceiverFilter}
                onChange={(event) => setRecordReceiverFilter(event.target.value)}
              >
                <option value="">全部抢包人</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
              <input
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                type="date"
                value={recordDateFrom}
                onChange={(event) => setRecordDateFrom(event.target.value)}
              />
              <input
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                type="date"
                value={recordDateTo}
                onChange={(event) => setRecordDateTo(event.target.value)}
              />
              {isAdmin ? (
                <select
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={recordStatusFilter}
                  onChange={(event) => setRecordStatusFilter(event.target.value)}
                >
                  <option value="approved">已审核</option>
                  <option value="pending">待审核</option>
                  <option value="rejected">已驳回</option>
                  <option value="">全部状态</option>
                </select>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">时间</th>
                  <th className="px-5 py-3">发包人</th>
                  <th className="px-5 py-3">红包总额</th>
                  <th className="px-5 py-3">参与人数</th>
                  <th className="px-5 py-3">已录入金额</th>
                  <th className="px-5 py-3">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={`cursor-pointer hover:bg-slate-50/70 ${selectedRecord?.id === record.id ? 'bg-red-50/60' : ''}`}
                    onClick={() => openRecord(record.id)}
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatTime(record.time)}</td>
                    <td className="px-5 py-3 font-medium">{record.sender_name}</td>
                    <td className="px-5 py-3">{formatMoney(record.total_amount)}</td>
                    <td className="px-5 py-3">{record.claim_count}</td>
                    <td className="px-5 py-3">{formatMoney(record.claimed_amount)}</td>
                    <td className="px-5 py-3 text-slate-500">{record.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span>
              已显示 {records.length} / {recordTotal} 条
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={records.length >= recordTotal}
              onClick={async () => {
                const nextLimit = recordLimit + 30
                setRecordLimit(nextLimit)
                const data = await getRecords({
                  limit: nextLimit,
                  status: isAdmin ? recordStatusFilter || undefined : 'approved',
                  senderId: recordSenderFilter || undefined,
                  receiverId: recordReceiverFilter || undefined,
                  search: recordSearch || undefined,
                  dateFrom: recordDateFrom ? new Date(recordDateFrom).toISOString() : undefined,
                  dateTo: recordDateTo ? new Date(`${recordDateTo}T23:59:59`).toISOString() : undefined,
                })
                setRecords(data.items)
                setRecordTotal(data.total)
              }}
            >
              加载更多
            </Button>
          </div>
        </div>

        {renderRecordEditor()}
      </section>
    )
  }

  function renderReviewQueue() {
    if (currentRole !== 'admin') {
      return renderPlaceholder('审核队列', '该页面仅管理员可见。')
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">审核队列</h2>
            <p className="mt-1 text-sm text-slate-500">待审核记录不会进入统计，管理员通过后才会计入。</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadPendingRecords}>
            刷新
          </Button>
        </div>

        <div className="p-5">
          {reviewError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{reviewError}</div> : null}
          {reviewMessage ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{reviewMessage}</div>
          ) : null}

          {pendingRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              当前没有待审核记录。
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRecords.map((record) => (
                <article key={record.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{record.sender_name}</p>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">待审核</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-500">
                        {formatTime(record.time)} · 总额 {formatMoney(record.total_amount)} · 明细合计 {formatMoney(record.claimed_amount)} ·{' '}
                        {record.claim_count} 人
                      </p>
                      {record.note ? <p className="mt-2 text-sm text-slate-600">备注：{record.note}</p> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => openRecord(record.id)}>
                        查看明细
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reviewRecord(record.id, 'reject')}
                        disabled={reviewingRecordId === record.id}
                      >
                        驳回
                      </Button>
                      <Button
                        className="bg-red-600 text-white hover:bg-red-700"
                        size="sm"
                        onClick={() => reviewRecord(record.id, 'approve')}
                        disabled={reviewingRecordId === record.id}
                      >
                        通过
                      </Button>
                    </div>
                  </div>
                  {selectedRecord?.id === record.id ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        {selectedRecord.claims.map((claim) => (
                          <div key={claim.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                            <span className="font-medium">{claim.participant_name}</span>
                            <span>{formatMoney(claim.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    )
  }

  function renderDeletedRecords() {
    if (currentRole !== 'admin') {
      return renderPlaceholder('已删除记录', '该页面仅管理员可见。')
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">已删除记录</h2>
            <p className="mt-1 text-sm text-slate-500">这里显示被管理员删除的记录，可恢复到记录列表。</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadDeletedRecords}>
            刷新
          </Button>
        </div>

        <div className="p-5">
          {deletedRecordError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deletedRecordError}</div> : null}
          {deletedRecordMessage ? (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{deletedRecordMessage}</div>
          ) : null}

          {deletedRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              当前没有已删除记录。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">时间</th>
                    <th className="px-5 py-3">发包人</th>
                    <th className="px-5 py-3">红包总额</th>
                    <th className="px-5 py-3">明细合计</th>
                    <th className="px-5 py-3">删除时间</th>
                    <th className="px-5 py-3">备注</th>
                    <th className="px-5 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deletedRecords.map((record) => (
                    <tr key={record.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatTime(record.time)}</td>
                      <td className="px-5 py-3 font-medium">{record.sender_name}</td>
                      <td className="px-5 py-3">{formatMoney(record.total_amount)}</td>
                      <td className="px-5 py-3">{formatMoney(record.claimed_amount)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{record.deleted_at ? formatTime(record.deleted_at) : '-'}</td>
                      <td className="px-5 py-3 text-slate-500">{record.note || '-'}</td>
                      <td className="px-5 py-3">
                        <Button variant="outline" size="sm" onClick={() => restoreRecord(record.id)} disabled={restoringRecordId === record.id}>
                          {restoringRecordId === record.id ? '恢复中' : '恢复'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">共 {deletedRecordTotal} 条</div>
      </section>
    )
  }

  function renderBackups() {
    if (currentRole !== 'admin') {
      return renderPlaceholder('备份管理', '该页面仅管理员可见。')
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">备份管理</h2>
            <p className="mt-1 text-sm text-slate-500">管理员可以创建和下载数据库备份；恢复请在服务器上执行恢复脚本，避免误覆盖线上数据。</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadBackups}>
              刷新
            </Button>
            <Button className="bg-slate-950 text-white hover:bg-slate-800" size="sm" onClick={handleCreateBackup} disabled={creatingBackup}>
              {creatingBackup ? '创建中' : '创建备份'}
            </Button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            恢复命令：<span className="font-mono">bash scripts/restore_db.sh /home/ubuntu/red-packet-backups/文件名.db.gz</span>
          </div>

          {backupError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{backupError}</div> : null}
          {backupMessage ? <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{backupMessage}</div> : null}

          {backups.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">当前还没有备份。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">文件名</th>
                    <th className="px-5 py-3">大小</th>
                    <th className="px-5 py-3">创建时间</th>
                    <th className="px-5 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.map((backup) => (
                    <tr key={backup.filename}>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">{backup.filename}</td>
                      <td className="px-5 py-3 text-slate-600">{formatBytes(backup.size_bytes)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatTime(backup.created_at)}</td>
                      <td className="px-5 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadBackup(backup.filename)}
                          disabled={downloadingBackup === backup.filename}
                        >
                          {downloadingBackup === backup.filename ? '下载中' : '下载'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    )
  }

  function renderAvatarCropDialog() {
    if (!avatarCrop) return null

    const imageReady = Boolean(avatarCrop.imageWidth && avatarCrop.imageHeight)
    const minScale = imageReady ? Math.max(avatarCropPreviewSize / avatarCrop.imageWidth, avatarCropPreviewSize / avatarCrop.imageHeight) : 1
    const displayWidth = avatarCrop.imageWidth * avatarCrop.scale
    const displayHeight = avatarCrop.imageHeight * avatarCrop.scale
    const left = avatarCropPreviewSize / 2 - displayWidth / 2 + avatarCrop.offsetX
    const top = avatarCropPreviewSize / 2 - displayHeight / 2 + avatarCrop.offsetY

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">裁剪头像</h2>
            <p className="mt-1 text-sm text-slate-500">拖动图片并调整缩放，正方形框内的部分会保存为头像。</p>
          </div>

          <div className="space-y-5 p-5">
            <div className="flex justify-center">
              <div
                className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                style={{ width: avatarCropPreviewSize, height: avatarCropPreviewSize }}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setAvatarCrop((current) =>
                    current
                      ? {
                          ...current,
                          dragging: true,
                          dragStartX: event.clientX,
                          dragStartY: event.clientY,
                          dragOriginX: current.offsetX,
                          dragOriginY: current.offsetY,
                        }
                      : current,
                  )
                }}
                onPointerMove={(event) => {
                  setAvatarCrop((current) => {
                    if (!current?.dragging) return current
                    const next = {
                      ...current,
                      offsetX: current.dragOriginX + event.clientX - current.dragStartX,
                      offsetY: current.dragOriginY + event.clientY - current.dragStartY,
                    }
                    return { ...next, ...clampAvatarOffset(next) }
                  })
                }}
                onPointerUp={(event) => {
                  event.currentTarget.releasePointerCapture(event.pointerId)
                  setAvatarCrop((current) => (current ? { ...current, dragging: false } : current))
                }}
                onPointerCancel={() => setAvatarCrop((current) => (current ? { ...current, dragging: false } : current))}
              >
                <img
                  className="absolute max-w-none select-none"
                  src={avatarCrop.sourceUrl}
                  alt="待裁剪头像"
                  draggable={false}
                  onLoad={(event) => initializeAvatarCrop(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
                  style={{
                    width: displayWidth || 'auto',
                    height: displayHeight || 'auto',
                    left,
                    top,
                    cursor: avatarCrop.dragging ? 'grabbing' : 'grab',
                  }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-inset ring-white/90" />
              </div>
            </div>

            <label className="block space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">缩放</span>
                <span className="text-slate-500">{Math.round((avatarCrop.scale / minScale) * 100)}%</span>
              </div>
              <input
                className="w-full accent-red-600"
                type="range"
                min={minScale}
                max={minScale * 4}
                step={0.01}
                value={avatarCrop.scale}
                disabled={!imageReady}
                onChange={(event) => updateAvatarCropScale(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-4">
            <Button variant="outline" onClick={() => setAvatarCrop(null)} disabled={savingAvatarParticipantId === avatarCrop.participant.id}>
              取消
            </Button>
            <Button
              className="bg-slate-950 text-white hover:bg-slate-800"
              onClick={confirmAvatarCrop}
              disabled={!imageReady || savingAvatarParticipantId === avatarCrop.participant.id}
            >
              {savingAvatarParticipantId === avatarCrop.participant.id ? '保存中' : '确认使用'}
            </Button>
          </div>
        </section>
      </div>
    )
  }

  function renderUsers() {
    if (currentRole !== 'admin') {
      return renderPlaceholder('用户管理', '该页面仅管理员可见。')
    }

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">网页访问账号</h2>
              <p className="mt-1 text-sm text-slate-500">管理员可新增账号、调整权限、启停账号和重置密码。</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadDashboardData}>
              刷新
            </Button>
          </div>

          <div className="border-b border-slate-100 p-5">
            <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              当前密码不会以明文保存，因此不能查看原密码；需要知道密码时，请在这里重置为一个新密码并自行记录。
            </div>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_150px_92px]">
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={newAppUser.username}
                onChange={(event) => setNewAppUser((current) => ({ ...current, username: event.target.value }))}
                placeholder="用户名"
              />
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={newAppUser.display_name}
                onChange={(event) => setNewAppUser((current) => ({ ...current, display_name: event.target.value }))}
                placeholder="显示名称"
              />
              <input
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                type="password"
                value={newAppUser.password}
                onChange={(event) => setNewAppUser((current) => ({ ...current, password: event.target.value }))}
                placeholder="初始密码"
              />
              <select
                className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={newAppUser.role}
                onChange={(event) => setNewAppUser((current) => ({ ...current, role: event.target.value as AppUser['role'] }))}
              >
                <option value="viewer">只读用户</option>
                <option value="contributor">协助录入</option>
                <option value="admin">管理员</option>
              </select>
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={createLoginAccount} disabled={savingAppUserId === 'new'}>
                {savingAppUserId === 'new' ? '新增中' : '新增'}
              </Button>
            </div>

            {userManageError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{userManageError}</div>
            ) : null}
            {userManageMessage ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{userManageMessage}</div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">用户名</th>
                  <th className="px-5 py-3">显示名称</th>
                  <th className="px-5 py-3">角色</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">新密码</th>
                  <th className="px-5 py-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appUsers.map((user) => {
                  const isSelf = currentUser?.id === user.id
                  const draft = appUserDrafts[user.id] ?? {
                    displayName: user.display_name,
                    role: user.role,
                    isActive: user.is_active,
                    password: '',
                  }

                  return (
                    <tr key={user.id}>
                      <td className="px-5 py-3 font-medium">{user.username}</td>
                      <td className="px-5 py-3">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          value={draft.displayName}
                          onChange={(event) =>
                            setAppUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...draft, displayName: event.target.value },
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-3">
                        <select
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          value={draft.role}
                          disabled={isSelf}
                          onChange={(event) =>
                            setAppUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...draft, role: event.target.value as AppUser['role'] },
                            }))
                          }
                        >
                          <option value="viewer">只读用户</option>
                          <option value="contributor">协助录入</option>
                          <option value="admin">管理员</option>
                        </select>
                      </td>
                      <td className="px-5 py-3">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                          <input
                            type="checkbox"
                            checked={draft.isActive}
                            disabled={isSelf}
                            onChange={(event) =>
                              setAppUserDrafts((current) => ({
                                ...current,
                                [user.id]: { ...draft, isActive: event.target.checked },
                              }))
                            }
                          />
                          {draft.isActive ? '启用' : '停用'}
                        </label>
                      </td>
                      <td className="px-5 py-3">
                        <input
                          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          type="password"
                          value={draft.password}
                          onChange={(event) =>
                            setAppUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...draft, password: event.target.value },
                            }))
                          }
                          placeholder="留空不修改"
                        />
                      </td>
                      <td className="px-5 py-3">
                        <Button variant="outline" size="sm" onClick={() => saveLoginAccount(user)} disabled={savingAppUserId === user.id}>
                          {savingAppUserId === user.id ? '保存中' : '保存'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">发包/抢包用户名单</h2>
            <p className="mt-1 text-sm text-slate-500">这些用户来自现有数据，录入时作为发包人与抢包人的预设选择。</p>
          </div>

          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={newParticipantName}
                onChange={(event) => setNewParticipantName(event.target.value)}
                placeholder="新增参与者名称"
              />
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={addParticipant} disabled={savingParticipant}>
                {savingParticipant ? '新增中' : '新增参与者'}
              </Button>
            </div>
            {participantError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{participantError}</div>
            ) : null}
            {participantMessage ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{participantMessage}</div>
            ) : null}
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((participant) => (
              <div key={participant.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarBubble participant={participant} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{participant.name}</p>
                      <p className="mt-1 text-xs text-slate-500">参与者 ID：{participant.id}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
                      participant.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {participant.is_active ? '可选择' : '已停用'}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <ImageUp className="size-3.5" />
                    {savingAvatarParticipantId === participant.id ? '处理中' : '上传头像'}
                    <input
                      className="hidden"
                      type="file"
                      accept="image/*"
                      disabled={savingAvatarParticipantId === participant.id}
                      onChange={(event) => {
                        void handleAvatarFile(participant, event.target.files?.[0])
                        event.currentTarget.value = ''
                      }}
                    />
                  </label>
                  {participant.avatar_data_url ? (
                    <Button variant="outline" size="xs" onClick={() => clearAvatar(participant)} disabled={savingAvatarParticipantId === participant.id}>
                      清空
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  function renderImport() {
    if (currentRole !== 'admin') {
      return renderPlaceholder('数据导入', '该页面仅管理员可见。')
    }

    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">数据导入</h2>
          <p className="mt-1 text-sm text-slate-500">旧 JSON 数据已导入当前数据库，这里先保留后续扩展入口。</p>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">当前状态</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              后端已经具备 JSON 导入方法，并会跳过已存在的旧记录。当前前端暂不提供重复导入按钮。
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">后续扩展</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">可以增加文件选择、导入预览、重复记录检查和导入报告下载。</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">权限边界</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">导入属于管理员操作，普通查看用户不会看到这个页面入口。</p>
          </div>
        </div>
      </section>
    )
  }

  function renderPlaceholder(title: string, description: string) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      </section>
    )
  }

  function renderActiveView() {
    if (!isAdmin && !viewerVisibleViews.has(activeView)) {
      return renderDashboard()
    }
    if (activeView === 'entry') {
      return renderEntry()
    }
    if (activeView === 'records') {
      return renderRecords()
    }
    if (activeView === 'recordStats') {
      return renderRecordStats()
    }
    if (activeView === 'announcements') {
      return renderAnnouncements()
    }
    if (activeView === 'review') {
      return renderReviewQueue()
    }
    if (activeView === 'deleted') {
      return renderDeletedRecords()
    }
    if (activeView === 'users') {
      return renderUsers()
    }
    if (activeView === 'backup') {
      return renderBackups()
    }
    if (activeView === 'import') {
      return renderImport()
    }
    return renderDashboard()
  }

  if (!currentUser) {
    return renderLogin()
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[248px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white lg:block">
          <div className="flex h-full flex-col px-4 py-5">
            <div className="flex items-center gap-3 px-2">
              <div className="flex size-10 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
                <Gift className="size-5" />
              </div>
              <div>
                <p className="text-base font-semibold">红包履历统计</p>
                <p className="text-xs text-slate-500">Web 工作台</p>
              </div>
            </div>

            <nav className="mt-8 space-y-1">
              {navItems.map((item) => {
                if (!isAdmin && !viewerVisibleViews.has(item.key)) {
                  return null
                }
                const Icon = item.icon
                const active = activeView === item.key

                return (
                  <button
                    key={item.label}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                      active
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                    onClick={() => setActiveView(item.key)}
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-medium text-slate-900">{currentUser.display_name}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                当前权限：{formatRole(currentUser.role)}。{isAdmin ? '可管理审核与系统数据。' : '只能查看和提交待审核记录。'}
              </p>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 xl:px-8">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <CalendarDays className="size-4" />
                  {appEnvironmentLabel ? `${appEnvironmentLabel} · ` : ''}
                  {loading ? '正在读取数据' : '已连接数据'}
                </div>
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">
                  {activeView === 'dashboard' ? '红包统计首页' : navItems.find((item) => item.key === activeView)?.label}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" className="hidden sm:inline-flex">
                  <Search className="size-4" />
                  搜索记录
                </Button>
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => setActiveView('entry')}>
                  <LockKeyhole className="size-4" />
                  {isAdmin ? '管理员录入' : '提交录入'}
                </Button>
                <Button variant="outline" onClick={handleLogout}>
                  <LogOut className="size-4" />
                  退出
                </Button>
              </div>
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 xl:px-8">
            {apiError ? (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {apiError}
              </div>
            ) : null}

            {renderActiveView()}
          </div>
        </section>
      </div>
      {renderAvatarCropDialog()}
    </main>
  )
}

export default App
