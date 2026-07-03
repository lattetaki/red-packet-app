import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Gift,
  ImageUp,
  LockKeyhole,
  LogOut,
  Menu,
  Medal,
  MonitorSmartphone,
  Plus,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react'
import type { TouchEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AvatarBubble } from '@/components/common/AvatarBubble'
import { PasswordField } from '@/components/common/PasswordField'
import { TrendLineChart } from '@/components/charts/TrendLineChart'
import { Button } from '@/components/ui/button'
import { navItems, viewerVisibleViews } from '@/config/navigation'
import { LoginPage } from '@/features/auth/LoginPage'
import { PopupNoticeModal } from '@/features/notices/PopupNoticeModal'
import { currentDateTimeLocal, endOfDay, presetStartDate, startOfDay, toDateInputValue, toDateTimeLocal } from '@/lib/date'
import { formatBytes, formatMoney, formatRole, formatStatus, formatTime } from '@/lib/format'
import { clamp, toNumber, toRatioNumber } from '@/lib/number'
import { isValidPasswordValue } from '@/lib/password'
import { buildLatestTrendByUser, makeClientId, newClaim, sumClaimAmounts } from '@/lib/records'
import { layoutModeKey, readLayoutMode, readSavedSession, readSenderDefaults, savedUserKey, senderDefaultsKey } from '@/lib/storage'
import type { AppUserDraft, AuthSession, AvatarCropState, EntryClaim, LayoutMode, StatsRangePreset, SummaryItem, TouchPoint, ViewKey } from '@/types/app'
import {
  ackPopupNotice,
  approveRecord,
  createAnnouncement,
  createBackup,
  createAppUser,
  createParticipant,
  createPopupNotice,
  createRecord,
  changeMyPassword,
  deleteRecord,
  downloadBackup,
  getAmountPresets,
  getAnnouncements,
  getAppUsers,
  getBackups,
  getDeletedRecords,
  getMe,
  getParticipants,
  getPinnedNotice,
  getCurrentPopupNotice,
  getPopupNotices,
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
  type PinnedNotice,
  type PopupNotice,
  type PopupNoticeCurrent,
  type PopupNoticePayload,
  type RecordCreatePayload,
  type RecordDetail,
  type RecordListItem,
  type RecordStatsResponse,
  type StatsQuery,
  type StreakRecordStat,
  type SummaryStats,
  type TrendPoint,
  type UserStatsItem,
  rejectRecord,
  restoreDeletedRecord,
  updateAnnouncement,
  updateAppUser,
  updatePopupNotice,
  updateMyAvatar,
  updateParticipantAvatar,
  updatePinnedNotice,
  updateRecord,
} from './api'
import './App.css'

const appEnvironmentLabel = import.meta.env.VITE_APP_ENV_LABEL ?? ''

const avatarCropPreviewSize = 280
const avatarOutputSize = 256

const fallbackSummary: SummaryStats = {
  record_count: 0,
  participant_count: 0,
  total_sent_amount: '0',
  total_claimed_amount: '0',
  pending_count: 0,
}

const fallbackPinnedNotice: PinnedNotice = {
  content: '',
  updated_at: null,
}

const fallbackRecordStats: RecordStatsResponse = {
  max_claims: [],
  min_claims: [],
  max_win_streaks: [],
  max_loss_streaks: [],
  personal: [],
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readSavedSession())
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => readLayoutMode())
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [touchStart, setTouchStart] = useState<TouchPoint | null>(null)
  const [statsRangePreset, setStatsRangePreset] = useState<StatsRangePreset>('all')
  const [statsDateFrom, setStatsDateFrom] = useState('')
  const [statsDateTo, setStatsDateTo] = useState(() => toDateInputValue(new Date()))
  const [summary, setSummary] = useState<SummaryStats>(fallbackSummary)
  const [pinnedNotice, setPinnedNotice] = useState<PinnedNotice>(fallbackPinnedNotice)
  const [pinnedNoticeDraft, setPinnedNoticeDraft] = useState('')
  const [pinnedNoticeMessage, setPinnedNoticeMessage] = useState<string | null>(null)
  const [pinnedNoticeError, setPinnedNoticeError] = useState<string | null>(null)
  const [savingPinnedNotice, setSavingPinnedNotice] = useState(false)
  const [currentPopupNotice, setCurrentPopupNotice] = useState<PopupNoticeCurrent>(null)
  const [popupNoticeDismiss, setPopupNoticeDismiss] = useState(false)
  const [popupNotices, setPopupNotices] = useState<PopupNotice[]>([])
  const [popupNoticeDraft, setPopupNoticeDraft] = useState<PopupNoticePayload>({ title: '小公告', content: '', recipient_user_ids: [], is_active: true })
  const [editingPopupNoticeId, setEditingPopupNoticeId] = useState<number | null>(null)
  const [popupNoticeMessage, setPopupNoticeMessage] = useState<string | null>(null)
  const [popupNoticeError, setPopupNoticeError] = useState<string | null>(null)
  const [savingPopupNotice, setSavingPopupNotice] = useState(false)
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
    participant_id: null,
    role: 'viewer',
    is_active: true,
  })
  const [userManageMessage, setUserManageMessage] = useState<string | null>(null)
  const [userManageError, setUserManageError] = useState<string | null>(null)
  const [savingAppUserId, setSavingAppUserId] = useState<number | 'new' | null>(null)
  const [amountPresets, setAmountPresets] = useState<AmountPreset[]>([])
  const [senderDefaultAmounts, setSenderDefaultAmounts] = useState<Record<string, string>>(() => readSenderDefaults())
  const [selectedTrendUserIds, setSelectedTrendUserIds] = useState<Set<number>>(new Set())
  const [trendSelectorOpen, setTrendSelectorOpen] = useState(false)
  const [selectedStatsUserId, setSelectedStatsUserId] = useState('')
  const [selectedRecordStatsUserId, setSelectedRecordStatsUserId] = useState('')
  const [savingAvatarParticipantId, setSavingAvatarParticipantId] = useState<number | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<AvatarCropState | null>(null)
  const [profilePasswordDraft, setProfilePasswordDraft] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' })
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [savingProfilePassword, setSavingProfilePassword] = useState(false)
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
  const currentUserId = currentUser?.id
  const authTokenValue = authSession?.token
  const currentRole = currentUser?.role ?? 'viewer'
  const isAdmin = currentRole === 'admin'
  const forceMobileShell = layoutMode === 'mobile'
  const forceDesktopShell = layoutMode === 'desktop'
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => isAdmin || viewerVisibleViews.has(item.key)),
    [isAdmin],
  )
  const statsQuery = useMemo<StatsQuery>(() => {
    if (statsRangePreset === 'all') return {}
    return {
      dateFrom: statsDateFrom ? startOfDay(new Date(statsDateFrom)).toISOString() : undefined,
      dateTo: statsDateTo ? endOfDay(new Date(statsDateTo)).toISOString() : undefined,
    }
  }, [statsDateFrom, statsDateTo, statsRangePreset])

  const loadDashboardData = useCallback(async () => {
    const [
      summaryData,
      pinnedNoticeData,
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
      currentUserData,
      currentPopupNoticeData,
      popupNoticeData,
    ] = await Promise.all([
      getSummaryStats(statsQuery),
      getPinnedNotice(),
      getRecentRecords(30),
      isAdmin ? getRecords({ status: 'pending', limit: 100 }) : Promise.resolve({ items: [], total: 0 }),
      isAdmin ? getDeletedRecords({ limit: 50 }) : Promise.resolve({ items: [], total: 0 }),
      isAdmin ? getBackups() : Promise.resolve([]),
      getMyRecords({ limit: 10 }),
      getUserStats(statsQuery),
      getRecordStats(statsQuery),
      getAnnouncements(),
      getTrendPoints(statsQuery),
      getParticipants(),
      getAmountPresets(),
      isAdmin ? getAppUsers() : Promise.resolve([]),
      getMe(),
      getCurrentPopupNotice(),
      isAdmin ? getPopupNotices() : Promise.resolve([]),
    ])

    setSummary(summaryData)
    setPinnedNotice(pinnedNoticeData)
    setPinnedNoticeDraft((current) => (current ? current : pinnedNoticeData.content))
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
    setCurrentPopupNotice(currentPopupNoticeData)
    setPopupNoticeDismiss(false)
    setPopupNotices(popupNoticeData)
    if (authTokenValue) {
      const nextSession = { user: currentUserData, token: authTokenValue }
      window.localStorage.setItem(savedUserKey, JSON.stringify(nextSession))
      setAuthSession(nextSession)
    }
    setAppUserDrafts(
      Object.fromEntries(
        appUserData.map((user) => [
          user.id,
          {
            displayName: user.display_name,
            participantId: user.participant_id ? String(user.participant_id) : '',
            role: user.role,
            isActive: user.is_active,
            password: '',
          },
        ]),
      ),
    )
    setSelectedTrendUserIds((current) => (current.size ? current : new Set(userStatsData.map((item) => item.participant_id))))
    setSenderId((current) => current || String(participantData[0]?.id ?? ''))
  }, [authTokenValue, isAdmin, statsQuery])

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

  function changeStatsPreset(preset: StatsRangePreset) {
    setStatsRangePreset(preset)
    if (preset === 'all') {
      setStatsDateFrom('')
      setStatsDateTo(toDateInputValue(new Date()))
    } else if (preset !== 'custom') {
      setStatsDateFrom(toDateInputValue(presetStartDate(preset)))
      setStatsDateTo(toDateInputValue(new Date()))
    }
  }

  function renderStatsRangeControls() {
    const options: Array<{ label: string; value: StatsRangePreset }> = [
      { label: '总和', value: 'all' },
      { label: '一天', value: 'day' },
      { label: '一周', value: 'week' },
      { label: '一月', value: 'month' },
      { label: '三月', value: 'quarter' },
      { label: '自定义', value: 'custom' },
    ]

    return (
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">统计时间范围</h2>
            <p className="mt-0.5 text-xs text-slate-500">首页、趋势、记录统计和个人概览共用这个时间范围。</p>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-lg bg-slate-100 p-1 text-xs sm:flex sm:text-sm">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`rounded-md px-2 py-1.5 font-medium ${
                  statsRangePreset === option.value ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
                onClick={() => changeStatsPreset(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {statsRangePreset === 'custom' ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              type="date"
              value={statsDateFrom}
              onChange={(event) => setStatsDateFrom(event.target.value)}
            />
            <input
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              type="date"
              value={statsDateTo}
              onChange={(event) => setStatsDateTo(event.target.value)}
            />
          </div>
        ) : null}
      </section>
    )
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
    if (!isValidPasswordValue(newAppUser.password)) {
      setUserManageError('密码需为 6-20 位，只支持半角英文字母、数字和常见符号。')
      return
    }

    try {
      setSavingAppUserId('new')
      await createAppUser({
        ...newAppUser,
        username: newAppUser.username.trim(),
        display_name: newAppUser.display_name.trim(),
      })
      setNewAppUser({ username: '', display_name: '', password: '', participant_id: null, role: 'viewer', is_active: true })
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
      participant_id: draft.participantId ? Number(draft.participantId) : null,
      role: draft.role,
      is_active: draft.isActive,
    }
    if (draft.password) {
      if (!isValidPasswordValue(draft.password)) {
        setUserManageError('密码需为 6-20 位，只支持半角英文字母、数字和常见符号。')
        return
      }
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
          participantId: updated.participant_id ? String(updated.participant_id) : '',
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
        mode: 'participant',
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

  async function handleSelfAvatarFile(file: File | undefined) {
    if (!file || !currentUser?.participant_id || !currentUser.participant_name) return
    setProfileMessage(null)
    setProfileError(null)

    try {
      const sourceUrl = await readImageFile(file)
      setAvatarCrop({
        participant: {
          id: currentUser.participant_id,
          name: currentUser.participant_name,
          avatar_data_url: currentUser.avatar_data_url,
        },
        mode: 'self',
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
      setProfileError('读取图片失败，请确认选择的是图片文件。')
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
      if (avatarCrop.mode === 'self') {
        const updatedUser = await updateMyAvatar(avatarDataUrl)
        const nextSession = { user: updatedUser, token: authSession?.token ?? '' }
        window.localStorage.setItem(savedUserKey, JSON.stringify(nextSession))
        setAuthSession(nextSession)
        setProfileMessage('头像已更新。')
      } else {
        const updated = await updateParticipantAvatar(avatarCrop.participant.id, avatarDataUrl)
        setParticipants((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        setParticipantMessage(`${avatarCrop.participant.name} 的头像已更新。`)
      }
      setAvatarCrop(null)
      await loadDashboardData()
    } catch {
      if (avatarCrop.mode === 'self') {
        setProfileError('头像保存失败，请重新选择图片。')
      } else {
        setParticipantError('头像保存失败，请重新选择图片。')
      }
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

  async function saveProfilePassword() {
    setProfileMessage(null)
    setProfileError(null)
    if (!profilePasswordDraft.oldPassword || !profilePasswordDraft.newPassword || !profilePasswordDraft.confirmPassword) {
      setProfileError('请填写旧密码、新密码和确认密码。')
      return
    }
    if (profilePasswordDraft.newPassword !== profilePasswordDraft.confirmPassword) {
      setProfileError('两次输入的新密码不一致。')
      return
    }
    if (!isValidPasswordValue(profilePasswordDraft.newPassword)) {
      setProfileError('新密码需为 6-20 位，只支持半角英文字母、数字和常见符号。')
      return
    }

    try {
      setSavingProfilePassword(true)
      const updatedUser = await changeMyPassword(profilePasswordDraft.oldPassword, profilePasswordDraft.newPassword)
      if (authSession?.token) {
        const nextSession = { user: updatedUser, token: authSession.token }
        window.localStorage.setItem(savedUserKey, JSON.stringify(nextSession))
        setAuthSession(nextSession)
      }
      setProfilePasswordDraft({ oldPassword: '', newPassword: '', confirmPassword: '' })
      setProfileMessage('密码已更新。')
    } catch {
      setProfileError('密码修改失败，请确认旧密码正确，且新密码符合规则。')
    } finally {
      setSavingProfilePassword(false)
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

  async function savePinnedNotice() {
    setPinnedNoticeMessage(null)
    setPinnedNoticeError(null)

    try {
      setSavingPinnedNotice(true)
      const saved = await updatePinnedNotice(pinnedNoticeDraft)
      setPinnedNotice(saved)
      setPinnedNoticeDraft(saved.content)
      setPinnedNoticeMessage(saved.content ? '置顶公告已更新。' : '置顶公告已清空。')
    } catch {
      setPinnedNoticeError('保存置顶公告失败，请稍后重试。')
    } finally {
      setSavingPinnedNotice(false)
    }
  }

  function resetPopupNoticeDraft() {
    setPopupNoticeDraft({ title: '小公告', content: '', recipient_user_ids: [], is_active: true })
    setEditingPopupNoticeId(null)
    setPopupNoticeError(null)
    setPopupNoticeMessage(null)
  }

  function editPopupNotice(notice: PopupNotice) {
    setPopupNoticeDraft({
      title: notice.title,
      content: notice.content,
      recipient_user_ids: notice.recipients.map((recipient) => recipient.user_id),
      is_active: notice.is_active,
    })
    setEditingPopupNoticeId(notice.id)
    setPopupNoticeError(null)
    setPopupNoticeMessage(null)
  }

  function togglePopupNoticeRecipient(userId: number) {
    setPopupNoticeDraft((current) => {
      const exists = current.recipient_user_ids.includes(userId)
      return {
        ...current,
        recipient_user_ids: exists
          ? current.recipient_user_ids.filter((id) => id !== userId)
          : [...current.recipient_user_ids, userId],
      }
    })
  }

  async function savePopupNotice() {
    setPopupNoticeError(null)
    setPopupNoticeMessage(null)
    if (!popupNoticeDraft.content.trim()) {
      setPopupNoticeError('请输入弹窗内容。')
      return
    }
    if (!popupNoticeDraft.title.trim()) {
      setPopupNoticeError('请输入弹窗标题。')
      return
    }
    if (popupNoticeDraft.recipient_user_ids.length === 0) {
      setPopupNoticeError('请至少选择一个接收用户。')
      return
    }

    try {
      setSavingPopupNotice(true)
      const payload = { ...popupNoticeDraft, title: popupNoticeDraft.title.trim(), content: popupNoticeDraft.content.trim() }
      if (editingPopupNoticeId) {
        await updatePopupNotice(editingPopupNoticeId, payload)
        setPopupNoticeMessage('弹窗公告已更新。')
      } else {
        await createPopupNotice(payload)
        setPopupNoticeMessage('弹窗公告已发布。')
      }
      resetPopupNoticeDraft()
      const notices = await getPopupNotices()
      setPopupNotices(notices)
    } catch {
      setPopupNoticeError('保存弹窗公告失败，请确认接收用户有效。')
    } finally {
      setSavingPopupNotice(false)
    }
  }

  async function closeCurrentPopupNotice() {
    if (!currentPopupNotice) return
    try {
      await ackPopupNotice(currentPopupNotice.id, popupNoticeDismiss)
      setCurrentPopupNotice(null)
      setPopupNoticeDismiss(false)
    } catch {
      setCurrentPopupNotice(null)
      setPopupNoticeDismiss(false)
    }
  }

  useEffect(() => {
    let active = true

    async function load() {
      if (!currentUserId) {
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
  }, [currentUserId, loadDashboardData])

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
  const currentRecordStatsUser = currentUser?.participant_id
    ? recordStats.personal.find((item) => item.participant.id === currentUser.participant_id)
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
      <div className="border-b border-slate-100 p-3 sm:p-5">
        <div className="mb-3 flex items-center gap-3 sm:mb-5 sm:gap-4">
          <AvatarBubble participant={participant} size="lg" />
          <div>
            <h3 className="text-base font-semibold sm:text-lg">{user.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">个人累计统计与排名</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
          {[
            { label: '发包金额', value: formatMoney(user.send_amount), rank: getUserRank(user, 'send_amount') },
            { label: '抢包金额', value: formatMoney(user.receive_amount), rank: getUserRank(user, 'receive_amount') },
            { label: '盈亏', value: formatMoney(user.pnl_amount), rank: getUserRank(user, 'pnl_amount') },
            { label: '平均每包', value: formatMoney(user.average_receive_amount), rank: getUserRank(user, 'average_receive_amount') },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2 sm:p-4">
              <p className="text-xs text-slate-500 sm:text-sm">{item.label}</p>
              <p className="mt-1 truncate text-lg font-semibold sm:mt-2 sm:text-2xl">{item.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 sm:mt-2 sm:text-xs">{item.rank}</p>
            </div>
          ))}
        </div>

        <div className="mt-2.5 rounded-lg border border-slate-200 p-2.5 sm:mt-5 sm:p-4">
          <h3 className="text-sm font-semibold">个人详细指标</h3>
          <div className="mt-3 space-y-1.5 sm:mt-4 sm:space-y-4">
            {metrics.map((item) => {
              const width = `${Math.max(3, ((Number(item.raw ?? item.value) || 0) / maxMetric) * 100)}%`

              return (
                <div key={item.label} className="grid grid-cols-[58px_1fr_104px] items-center gap-1.5 md:grid-cols-[92px_1fr_180px] md:gap-2">
                  <span className="text-[11px] text-slate-600 sm:text-sm">{item.label}</span>
                  <div className="h-4 rounded-lg bg-slate-100 p-0.5 sm:h-7 sm:p-1">
                    <div className={`h-full rounded-md ${item.color}`} style={{ width }} />
                  </div>
                  <span className="text-right text-[11px] leading-4 text-slate-600 sm:text-sm">
                    {item.value} <span className="text-slate-400">{item.rank}</span>
                  </span>
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500 sm:mt-5 sm:text-sm">
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
      { label: '净吃米最多', value: item.top_net_received_from ? formatMoney(item.top_net_received_from.amount) : '-', detail: renderCounterpartyLine(item.top_net_received_from, '净来自') },
      { label: '净送米最多', value: item.top_net_sent_to ? formatMoney(item.top_net_sent_to.amount) : '-', detail: renderCounterpartyLine(item.top_net_sent_to, '净送给') },
    ]

    return (
      <div className="border-t border-slate-100 p-3 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <AvatarBubble participant={item.participant} size="lg" />
          <div>
            <h3 className="text-base font-semibold sm:text-lg">{item.participant.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">个人记录峰值与主要往来对象</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:p-4">
              <p className="text-xs text-slate-500 sm:text-sm">{card.label}</p>
              <p className="mt-1 truncate text-lg font-semibold sm:mt-2 sm:text-2xl">{card.value}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500 sm:mt-2 sm:text-sm">{card.detail}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function renderRecordStats() {
    return (
      <div className="space-y-5">
        {renderStatsRangeControls()}
        <section className="grid gap-5 xl:grid-cols-4">
          {renderTopClaimCard('最大红包', recordStats.max_claims, 'best')}
          {renderTopClaimCard('最大倒霉蛋', recordStats.min_claims, 'low')}
          {renderTopStreakCard('最大连胜', recordStats.max_win_streaks, '不发包的最长连续参与场次', 'win')}
          {renderTopStreakCard('最大连败', recordStats.max_loss_streaks, '连续发包的最长场次', 'loss')}
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-3 py-3 sm:px-5 sm:py-4">
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold">个人记录概览</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">选择一个用户查看个人最大/最小红包、连胜连败和往来金额。</p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
                {recordStats.personal.map((item) => {
                  const selected = selectedRecordStatsUserId === String(item.participant.id)

                  return (
                    <button
                      key={item.participant.id}
                      type="button"
                      className={`min-w-0 rounded-lg border px-2 py-2 text-sm font-medium transition ${
                        selected
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-red-100 hover:bg-red-50/60 hover:text-red-700'
                      }`}
                      onClick={() => setSelectedRecordStatsUserId(String(item.participant.id))}
                    >
                      <span className="block truncate">{item.participant.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          {selectedRecordStatsUser ? (
            renderRecordStatsPersonal(selectedRecordStatsUser)
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">请选择一个用户。</div>
          )}
        </section>
      </div>
    )
  }

  function renderProfile() {
    const profileParticipant =
      currentUser?.participant_id && currentUser.participant_name
        ? {
            id: currentUser.participant_id,
            name: currentUser.participant_name,
            avatar_data_url: currentUser.avatar_data_url,
          }
        : null

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">账号管理</h2>
            <p className="mt-1 text-sm text-slate-500">管理自己的头像和登录密码。</p>
          </div>
          <div className="grid gap-5 p-4 lg:grid-cols-[280px_1fr] lg:p-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-4">
                {profileParticipant ? <AvatarBubble participant={profileParticipant} size="xl" /> : <div className="flex size-20 items-center justify-center rounded-lg bg-slate-200 text-slate-500">?</div>}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{currentUser?.display_name}</p>
                  <p className="mt-1 text-sm text-slate-500">{currentUser?.username}</p>
                  <p className="mt-1 text-xs text-slate-500">{profileParticipant ? `绑定参与者：${profileParticipant.name}` : '当前账号未绑定参与者'}</p>
                </div>
              </div>
              <label className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                上传头像
                <input className="hidden" type="file" accept="image/*" onChange={(event) => handleSelfAvatarFile(event.target.files?.[0])} disabled={!profileParticipant} />
              </label>
              {!profileParticipant ? <p className="mt-3 text-xs text-amber-700">需要管理员先把网页登录账号绑定到发包抢包用户，才能上传头像和查看个人统计。</p> : null}
            </div>

            <div className="space-y-3">
              {profileMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{profileMessage}</div> : null}
              {profileError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{profileError}</div> : null}
              <div className="grid gap-3 md:grid-cols-3">
                <PasswordField
                  label="旧密码"
                  value={profilePasswordDraft.oldPassword}
                  onChange={(value) => setProfilePasswordDraft((current) => ({ ...current, oldPassword: value }))}
                  autoComplete="current-password"
                />
                <PasswordField
                  label="新密码"
                  value={profilePasswordDraft.newPassword}
                  onChange={(value) => setProfilePasswordDraft((current) => ({ ...current, newPassword: value }))}
                  autoComplete="new-password"
                />
                <PasswordField
                  label="确认新密码"
                  value={profilePasswordDraft.confirmPassword}
                  onChange={(value) => setProfilePasswordDraft((current) => ({ ...current, confirmPassword: value }))}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">密码长度 6-20 位，仅支持半角英文字母、数字和常见符号，不支持中文或空格。</p>
                <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={saveProfilePassword} disabled={savingProfilePassword}>
                  {savingProfilePassword ? '保存中' : '修改密码'}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {renderStatsRangeControls()}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">个人记录概览</h2>
            <p className="mt-1 text-sm text-slate-500">当前时间范围内的个人最大/最小红包、连胜连败和往来金额。</p>
          </div>
          {currentRecordStatsUser ? (
            renderRecordStatsPersonal(currentRecordStatsUser)
          ) : (
            <div className="p-10 text-center text-sm text-slate-500">{profileParticipant ? '当前时间范围内暂无个人记录。' : '当前账号尚未绑定参与者。'}</div>
          )}
        </section>
      </div>
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

  function renderPopupNotices() {
    if (!isAdmin) {
      return renderPlaceholder('弹窗公告', '该页面仅管理员可见。')
    }

    const selectedRecipientIds = new Set(popupNoticeDraft.recipient_user_ids)

    return (
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">{editingPopupNoticeId ? '编辑弹窗公告' : '发布弹窗公告'}</h2>
            <p className="mt-1 text-sm text-slate-500">用户登录后会看到最新一条未忽略的弹窗公告。</p>
          </div>
          <div className="space-y-4 p-5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">弹窗标题</span>
              <input
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={popupNoticeDraft.title}
                maxLength={120}
                onChange={(event) => setPopupNoticeDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：小公告"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-500">弹窗内容</span>
              <textarea
                className="min-h-32 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={popupNoticeDraft.content}
                maxLength={2000}
                onChange={(event) => setPopupNoticeDraft((current) => ({ ...current, content: event.target.value }))}
                placeholder="写一段给用户看的弹窗内容。"
              />
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-700">接收用户</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => setPopupNoticeDraft((current) => ({ ...current, recipient_user_ids: [] }))}>
                    全不选
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setPopupNoticeDraft((current) => ({ ...current, recipient_user_ids: appUsers.map((user) => user.id) }))}
                  >
                    全选
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {appUsers.map((user) => {
                  const selected = selectedRecipientIds.has(user.id)

                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`min-w-0 rounded-lg border px-3 py-2 text-left text-sm ${
                        selected
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-red-100 hover:bg-red-50/60 hover:text-red-700'
                      }`}
                      onClick={() => togglePopupNoticeRecipient(user.id)}
                    >
                      <span className="block truncate font-medium">{user.display_name}</span>
                      <span className="mt-0.5 block truncate text-xs opacity-70">{user.username}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={popupNoticeDraft.is_active}
                onChange={(event) => setPopupNoticeDraft((current) => ({ ...current, is_active: event.target.checked }))}
              />
              启用这条弹窗
            </label>

            {popupNoticeError ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{popupNoticeError}</div> : null}
            {popupNoticeMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{popupNoticeMessage}</div> : null}

            <div className="flex flex-wrap justify-end gap-2">
              {editingPopupNoticeId ? (
                <Button variant="outline" onClick={resetPopupNoticeDraft} disabled={savingPopupNotice}>
                  取消编辑
                </Button>
              ) : null}
              <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={savePopupNotice} disabled={savingPopupNotice}>
                {savingPopupNotice ? '保存中' : editingPopupNoticeId ? '保存弹窗' : '发布弹窗'}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">弹窗公告记录</h2>
            <p className="mt-1 text-sm text-slate-500">只会向用户展示最新一条仍启用且未被忽略的弹窗。</p>
          </div>
          {popupNotices.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">暂无弹窗公告。</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {popupNotices.map((notice) => {
                const seenCount = notice.recipients.filter((recipient) => recipient.seen_at).length
                const dismissedCount = notice.recipients.filter((recipient) => recipient.dismissed_at).length

                return (
                  <article key={notice.id} className="px-5 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${notice.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {notice.is_active ? '启用' : '停用'}
                          </span>
                          <span className="font-semibold text-slate-900">{notice.title}</span>
                          <span className="text-xs text-slate-500">创建：{formatTime(notice.created_at)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notice.content}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          接收 {notice.recipients.length} 人，已看 {seenCount} 人，不再提醒 {dismissedCount} 人
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {notice.recipients.map((recipient) => recipient.display_name).join('、')}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => editPopupNotice(notice)}>
                        编辑
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
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
    if (selectedRecord?.id === recordId) {
      setSelectedRecord(null)
      setRecordEditMode(false)
      return
    }

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
      <section className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {summaryItems.map((item) => {
          const Icon = item.icon

          return (
            <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-2 sm:gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 sm:text-sm">{item.label}</p>
                  <p className="mt-2 truncate text-xl font-semibold sm:mt-4 sm:text-3xl">{item.value}</p>
                </div>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-700 sm:size-12">
                  <Icon className="size-4 sm:size-6" />
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500 sm:mt-5 sm:text-sm">{item.helper}</p>
            </article>
          )
        })}
      </section>
    )
  }

  function renderPinnedNotice() {
    if (!pinnedNotice.content && !isAdmin) return null

    return (
      <section className="mb-5 rounded-lg border border-red-100 bg-red-50 px-5 py-4 shadow-sm">
        {pinnedNotice.content ? (
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="text-sm font-medium leading-6 text-red-800">{pinnedNotice.content}</p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <BookOpen className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <p className="text-sm leading-6 text-slate-500">当前没有置顶公告。</p>
          </div>
        )}

        {isAdmin ? (
          <div className="mt-4 border-t border-red-100 pt-4">
            <div className="flex flex-col gap-2 lg:flex-row">
              <input
                className="h-10 min-w-0 flex-1 rounded-lg border border-red-100 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={pinnedNoticeDraft}
                maxLength={500}
                onChange={(event) => setPinnedNoticeDraft(event.target.value)}
                placeholder="输入一行首页置顶公告，留空保存则隐藏"
              />
              <Button className="bg-red-600 text-white hover:bg-red-700" onClick={savePinnedNotice} disabled={savingPinnedNotice}>
                {savingPinnedNotice ? '保存中' : '保存公告'}
              </Button>
            </div>
            {pinnedNoticeError ? <div className="mt-2 text-sm text-red-700">{pinnedNoticeError}</div> : null}
            {pinnedNoticeMessage ? <div className="mt-2 text-sm text-emerald-700">{pinnedNoticeMessage}</div> : null}
          </div>
        ) : null}
      </section>
    )
  }

  function renderDashboard() {
    return (
      <>
        {renderPinnedNotice()}
        <div className="mb-5">{renderStatsRangeControls()}</div>
        {renderSummaryCards()}

        <section className="mt-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:mt-5 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">盈亏排行</h2>
              <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">按当前累计盈亏排序。</p>
            </div>
            <BarChart3 className="size-5 text-slate-400" />
          </div>

          <div className="mt-2 space-y-0.5 sm:mt-5 sm:space-y-4">
            {userStats.map((user) => {
              const pnl = toNumber(user.pnl_amount)
              const width = `${Math.max(12, (Math.abs(pnl) / maxAbsPnl) * 100)}%`
              const positive = pnl >= 0

              return (
                <div key={user.participant_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-0.5 sm:grid-cols-[82px_1fr_78px] sm:px-0 sm:py-0">
                  <div className="min-w-0 sm:block">
                    <p className="truncate text-xs font-medium sm:text-base">
                      {user.name}
                      <span className="ml-2 font-normal text-slate-400 sm:hidden">{user.send_ratio}</span>
                    </p>
                    <p className="hidden text-xs text-slate-500 sm:block">{user.send_ratio}</p>
                  </div>
                  <div className="hidden h-8 rounded-lg bg-slate-100 p-1 sm:block">
                    <div className={`h-full rounded-md ${positive ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width }} />
                  </div>
                  <div className={`text-right text-xs font-semibold sm:text-base ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {positive ? '+' : ''}
                    {user.pnl_amount}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm sm:mt-5">
          <div className="border-b border-slate-100 px-3 py-3 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">全员统计</h2>
                <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">选择一个用户查看个人概览。</p>
              </div>
              <select
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 sm:w-auto"
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">累计盈亏趋势</h2>
                <p className="mt-1 text-sm text-slate-500">默认显示所有人，需要筛选时手动打开用户选择。</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setTrendSelectorOpen((current) => !current)}>
                {trendSelectorOpen ? '收起选择' : '选择用户'}
              </Button>
            </div>
          </div>

          <div className="space-y-4 p-3 sm:p-5">
            {trendSelectorOpen ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-700">显示用户</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="xs" onClick={() => setSelectedTrendUserIds(new Set())}>
                    全不选
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => setSelectedTrendUserIds(new Set(userStats.map((item) => item.participant_id)))}
                  >
                    全选
                  </Button>
                </div>
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
            ) : null}

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

          <div className="divide-y divide-slate-100 md:hidden">
            {records.map((record) => {
              const isExpanded = selectedRecord?.id === record.id

              return (
                <button
                  key={record.id}
                  type="button"
                  className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${isExpanded ? 'bg-red-50/60' : ''}`}
                  onClick={() => openRecord(record.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">{record.sender_name}</p>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{record.claim_count} 人</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{formatTime(record.time).slice(0, 16)}</p>
                      {record.note ? <p className="mt-1 truncate text-xs text-slate-500">备注：{record.note}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{formatMoney(record.total_amount)}</p>
                      <p className="mt-1 text-xs text-slate-500">录入 {formatMoney(record.claimed_amount)}</p>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 rounded-lg border border-red-100 bg-white px-3 py-2">
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>抢包明细</span>
                        <span>再点收起</span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                        {selectedRecord.claims.map((claim) => (
                          <div key={claim.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs">
                            <span className="min-w-0 truncate font-medium text-slate-700">{claim.participant_name}</span>
                            <span className="shrink-0 font-semibold text-slate-950">{formatMoney(claim.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
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
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_150px_92px]">
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
                value={newAppUser.participant_id ?? ''}
                onChange={(event) =>
                  setNewAppUser((current) => ({ ...current, participant_id: event.target.value ? Number(event.target.value) : null }))
                }
              >
                <option value="">不绑定参与者</option>
                {participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
              </select>
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
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">用户名</th>
                  <th className="px-5 py-3">显示名称</th>
                  <th className="px-5 py-3">绑定参与者</th>
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
                    participantId: user.participant_id ? String(user.participant_id) : '',
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
                          value={draft.participantId}
                          onChange={(event) =>
                            setAppUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...draft, participantId: event.target.value },
                            }))
                          }
                        >
                          <option value="">不绑定</option>
                          {participants.map((participant) => (
                            <option key={participant.id} value={participant.id}>
                              {participant.name}
                            </option>
                          ))}
                        </select>
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
    if (activeView === 'profile') {
      return renderProfile()
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
    if (activeView === 'popupNotices') {
      return renderPopupNotices()
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

  function changeLayoutMode(nextMode: LayoutMode) {
    setLayoutMode(nextMode)
    window.localStorage.setItem(layoutModeKey, nextMode)
    setMobileNavOpen(false)
  }

  function cycleLayoutMode() {
    changeLayoutMode(layoutMode === 'auto' ? 'mobile' : layoutMode === 'mobile' ? 'desktop' : 'auto')
  }

  function navigateToView(view: ViewKey, closeNav = false) {
    setActiveView(view)
    if (closeNav || mobileNavOpen) {
      setMobileNavOpen(false)
    }
  }

  function handleShellTouchStart(event: TouchEvent<HTMLElement>) {
    if (forceDesktopShell) return
    const touch = event.touches[0]
    setTouchStart({ x: touch.clientX, y: touch.clientY })
  }

  function handleShellTouchEnd(event: TouchEvent<HTMLElement>) {
    if (!touchStart || forceDesktopShell) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStart.x
    const deltaY = touch.clientY - touchStart.y
    setTouchStart(null)

    if (Math.abs(deltaY) > 80 || Math.abs(deltaX) < 70) return
    if (deltaX > 0 && touchStart.x < 40) {
      setMobileNavOpen(true)
    }
    if (deltaX < 0 && mobileNavOpen) {
      setMobileNavOpen(false)
    }
  }

  function renderNavigation(closeAfterSelect = false) {
    return (
      <nav className="space-y-1">
        {visibleNavItems.map((item) => {
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
              onClick={() => navigateToView(item.key, closeAfterSelect)}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    )
  }

  function renderSidebarContent(closeAfterSelect = false) {
    if (!currentUser) return null

    return (
      <div className="flex h-full flex-col px-4 py-5">
        <div className="flex items-center gap-3 px-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
            <Gift className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">红包履历统计</p>
            <p className="text-xs text-slate-500">Web 工作台</p>
          </div>
        </div>

        <div className="mt-8">{renderNavigation(closeAfterSelect)}</div>

        <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-900">{currentUser.display_name}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            当前权限：{formatRole(currentUser.role)}。{isAdmin ? '可管理审核与系统数据。' : '可查看和提交记录。'}
          </p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return (
      <LoginPage
        username={loginUsername}
        password={loginPassword}
        error={loginError}
        loggingIn={loggingIn}
        onUsernameChange={setLoginUsername}
        onPasswordChange={setLoginPassword}
        onLogin={handleLogin}
      />
    )
  }

  return (
    <main
      className="min-h-screen bg-[#f5f7fb] text-slate-950"
      onTouchStart={handleShellTouchStart}
      onTouchEnd={handleShellTouchEnd}
    >
      <div
        className={`grid min-h-screen ${
          forceDesktopShell ? 'min-w-[980px] grid-cols-[248px_1fr]' : forceMobileShell ? '' : 'lg:grid-cols-[248px_1fr]'
        }`}
      >
        <aside className={`border-r border-slate-200 bg-white ${forceDesktopShell ? 'block' : forceMobileShell ? 'hidden' : 'hidden lg:block'}`}>
          {renderSidebarContent(false)}
        </aside>

        {!forceDesktopShell ? (
          <div
            className={`fixed inset-0 z-40 bg-slate-950/30 transition-opacity ${
              mobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            } ${forceMobileShell ? '' : 'lg:hidden'}`}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        ) : null}

        {!forceDesktopShell ? (
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-[72vw] max-w-[320px] min-w-[260px] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
              mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
            } ${forceMobileShell ? '' : 'lg:hidden'}`}
            aria-label="移动端导航"
          >
            <div className="absolute right-3 top-3">
              <Button variant="outline" size="icon" onClick={() => setMobileNavOpen(false)} aria-label="关闭导航">
                <X className="size-4" />
              </Button>
            </div>
            {renderSidebarContent(true)}
          </aside>
        ) : null}

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
            <div className="space-y-3 px-4 py-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:gap-4 lg:space-y-0 xl:px-8">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  {!forceDesktopShell ? (
                    <Button
                      variant="outline"
                      size="icon"
                      className={forceMobileShell ? 'mr-1' : 'mr-1 lg:hidden'}
                      onClick={() => setMobileNavOpen(true)}
                      aria-label="打开导航"
                    >
                      <Menu className="size-4" />
                    </Button>
                  ) : null}
                  <CalendarDays className="size-4 shrink-0" />
                  <span className="truncate">
                    {appEnvironmentLabel ? `${appEnvironmentLabel} · ` : ''}
                    {loading ? '正在读取数据' : '已连接数据'}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:truncate">
                  {activeView === 'dashboard' ? '红包统计首页' : navItems.find((item) => item.key === activeView)?.label}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="hidden sm:inline-flex">
                  <Search className="size-4" />
                  搜索记录
                </Button>
                {activeView === 'dashboard' ? (
                  <Button variant="outline" size="sm" onClick={cycleLayoutMode}>
                    <MonitorSmartphone className="size-4" />
                    {layoutMode === 'auto' ? '自动' : layoutMode === 'mobile' ? '手机' : '桌面'}
                  </Button>
                ) : null}
                <Button className="bg-red-600 text-white hover:bg-red-700" onClick={() => navigateToView('entry')}>
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
      <PopupNoticeModal
        notice={currentPopupNotice}
        dismissed={popupNoticeDismiss}
        onDismissedChange={setPopupNoticeDismiss}
        onClose={closeCurrentPopupNotice}
      />
      {renderAvatarCropDialog()}
    </main>
  )
}

export default App
