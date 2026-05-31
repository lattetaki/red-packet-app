import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CircleDollarSign,
  Database,
  Gift,
  Home,
  LockKeyhole,
  ListChecks,
  Plus,
  Search,
  Users,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  approveRecord,
  createRecord,
  deleteRecord,
  getAmountPresets,
  getAppUsers,
  getParticipants,
  getRecord,
  getRecords,
  getRecentRecords,
  getSummaryStats,
  getTrendPoints,
  getUserStats,
  type AppUser,
  type AmountPreset,
  type Participant,
  type RecordCreatePayload,
  type RecordDetail,
  type RecordListItem,
  type SummaryStats,
  type TrendPoint,
  type UserStatsItem,
  rejectRecord,
  updateRecord,
} from './api'
import './App.css'

type ViewKey = 'dashboard' | 'entry' | 'records' | 'review' | 'users' | 'import'

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

const navItems: Array<{ label: string; icon: ElementType; key: ViewKey }> = [
  { label: '首页', icon: Home, key: 'dashboard' },
  { label: '录入', icon: Plus, key: 'entry' },
  { label: '记录列表', icon: ListChecks, key: 'records' },
  { label: '审核队列', icon: LockKeyhole, key: 'review' },
  { label: '用户管理', icon: Users, key: 'users' },
  { label: '数据导入', icon: Database, key: 'import' },
]

const currentRole: 'admin' | 'viewer' | 'contributor' = 'admin'
const adminOnlyViews = new Set<ViewKey>(['review', 'users', 'import'])

const chartColors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#4f46e5']

const fallbackSummary: SummaryStats = {
  record_count: 0,
  participant_count: 0,
  total_sent_amount: '0',
  total_claimed_amount: '0',
  pending_count: 0,
}

function formatMoney(amount: string) {
  return `¥${amount}`
}

function formatTime(value: string) {
  return value.replace('T', ' ').slice(0, 19)
}

function formatRole(role: AppUser['role']) {
  const labels: Record<AppUser['role'], string> = {
    admin: '管理员',
    viewer: '只读用户',
    contributor: '协助录入',
  }
  return labels[role]
}

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
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

function newClaim(participantId = ''): EntryClaim {
  return { id: crypto.randomUUID(), participantId, amount: '' }
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
  const [activeView, setActiveView] = useState<ViewKey>('dashboard')
  const [summary, setSummary] = useState<SummaryStats>(fallbackSummary)
  const [records, setRecords] = useState<RecordListItem[]>([])
  const [pendingRecords, setPendingRecords] = useState<RecordListItem[]>([])
  const [userStats, setUserStats] = useState<UserStatsItem[]>([])
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [appUsers, setAppUsers] = useState<AppUser[]>([])
  const [amountPresets, setAmountPresets] = useState<AmountPreset[]>([])
  const [selectedTrendUserIds, setSelectedTrendUserIds] = useState<Set<number>>(new Set())
  const [entryTime, setEntryTime] = useState(currentDateTimeLocal())
  const [senderId, setSenderId] = useState('')
  const [totalAmount, setTotalAmount] = useState('10')
  const [note, setNote] = useState('')
  const [entryClaims, setEntryClaims] = useState<EntryClaim[]>([newClaim(), newClaim(), newClaim(), newClaim()])
  const [entryMessage, setEntryMessage] = useState<string | null>(null)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [savingEntry, setSavingEntry] = useState(false)
  const [recordSearch, setRecordSearch] = useState('')
  const [recordSenderFilter, setRecordSenderFilter] = useState('')
  const [recordStatusFilter, setRecordStatusFilter] = useState('approved')
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
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  async function loadDashboardData() {
    const [summaryData, recordData, pendingRecordData, userStatsData, trendData, participantData, presetData, appUserData] = await Promise.all([
      getSummaryStats(),
      getRecentRecords(30),
      getRecords({ status: 'pending', limit: 100 }),
      getUserStats(),
      getTrendPoints(),
      getParticipants(),
      getAmountPresets(),
      currentRole === 'admin' ? getAppUsers() : Promise.resolve([]),
    ])

    setSummary(summaryData)
    setRecords(recordData)
    setPendingRecords(pendingRecordData)
    setUserStats(userStatsData)
    setTrendPoints(trendData)
    setParticipants(participantData)
    setAmountPresets(presetData)
    setAppUsers(appUserData)
    setSelectedTrendUserIds((current) => (current.size ? current : new Set(userStatsData.map((item) => item.participant_id))))
    setSenderId((current) => current || String(participantData[0]?.id ?? ''))
  }

  async function loadRecordList() {
    const data = await getRecords({
      limit: 30,
      status: recordStatusFilter || undefined,
      senderId: recordSenderFilter || undefined,
      search: recordSearch || undefined,
    })
    setRecords(data)
  }

  async function loadPendingRecords() {
    const data = await getRecords({ status: 'pending', limit: 100 })
    setPendingRecords(data)
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        await loadDashboardData()
        if (active) {
          setApiError(null)
        }
      } catch {
        if (active) {
          setApiError('后端暂未连接，当前页面只显示空状态。')
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
  const maxAbsPnl = Math.max(1, ...userStats.map((item) => Math.abs(toNumber(item.pnl_amount))))
  const claimTotal = sumClaimAmounts(entryClaims)
  const amountMismatch = Math.abs(claimTotal - toNumber(totalAmount)) > 0.001

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
    setTotalAmount('10')
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
      status: 'approved',
      claims,
    }

    try {
      setSavingEntry(true)
      await createRecord(payload)
      await loadDashboardData()
      resetEntryForm(true)
      setEntryMessage('记录已保存，并已进入统计。')
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
      setRecordDraftTime(toDateTimeLocal(record.time))
      setRecordDraftSenderId(String(record.sender_id))
      setRecordDraftTotal(record.total_amount)
      setRecordDraftNote(record.note)
      setRecordDraftStatus(record.status as 'approved' | 'pending' | 'rejected')
      setRecordDraftClaims(
        record.claims.map((claim) => ({
          id: crypto.randomUUID(),
          participantId: String(claim.participant_id),
          amount: claim.amount,
        })),
      )
    } catch {
      setRecordError('读取记录详情失败。')
    }
  }

  async function saveSelectedRecord() {
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
    if (!selectedRecord) return
    const confirmed = window.confirm(`确定删除这条记录吗？\n\n时间：${formatTime(selectedRecord.time)}\n发包人：${selectedRecord.sender_name}`)
    if (!confirmed) return

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
            <h2 className="text-base font-semibold">全员统计</h2>
            <p className="mt-1 text-sm text-slate-500">显示全部参与人，后续这里会升级为可筛选的独立统计页。</p>
          </div>
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
            <p className="mt-1 text-sm text-slate-500">当前仅管理员可录入；后续可开放协作录入并进入审核。</p>
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
              {amountMismatch ? '，与总额不一致，保存前请确认。' : '，与总额一致。'}
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
                {savingEntry ? '保存中' : '保存并进入统计'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">录入说明</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            这版先按管理员录入保存为已审核记录，因此会立刻进入统计。后续开放协作录入时，其他用户提交的记录会保存为待审核。
          </p>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            当前名单共有 {participants.length} 人，金额预设 {amountPresets.map((preset) => `¥${preset.amount}`).join(' / ') || '暂无'}。
          </div>
        </div>
      </section>
    )
  }

  function renderRecordEditor() {
    if (!selectedRecord) {
      return (
        <aside className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          双击左侧任意记录查看明细。这里会显示主记录和抢包明细，并支持编辑、保存和删除。
        </aside>
      )
    }

    const draftClaimTotal = sumClaimAmounts(recordDraftClaims)
    const draftMismatch = Math.abs(draftClaimTotal - toNumber(recordDraftTotal)) > 0.001

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
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">发包人</span>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                value={recordDraftSenderId}
                onChange={(event) => setRecordDraftSenderId(event.target.value)}
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
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">备注</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={recordDraftNote}
              onChange={(event) => setRecordDraftNote(event.target.value)}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">抢包明细</span>
              <Button
                variant="outline"
                size="xs"
                onClick={() => setRecordDraftClaims((current) => [...current, newClaim()])}
              >
                <Plus className="size-3" />
                加一行
              </Button>
            </div>

            {recordDraftClaims.map((claim) => (
              <div key={claim.id} className="grid grid-cols-[1fr_92px_56px] gap-2">
                <select
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={claim.participantId}
                  onChange={(event) =>
                    setRecordDraftClaims((current) =>
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
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-right text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                  value={claim.amount}
                  onChange={(event) =>
                    setRecordDraftClaims((current) =>
                      current.map((item) => (item.id === claim.id ? { ...item, amount: event.target.value } : item)),
                    )
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setRecordDraftClaims((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== claim.id)))
                  }
                >
                  删除
                </Button>
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

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={deleteSelectedRecord}>
              删除记录
            </Button>
            <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={saveSelectedRecord} disabled={savingRecord}>
              {savingRecord ? '保存中' : '保存修改'}
            </Button>
          </div>
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
                <p className="mt-1 text-sm text-slate-500">双击记录可查看明细并编辑。</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadRecordList}>
                筛选
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_140px]">
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
                value={recordStatusFilter}
                onChange={(event) => setRecordStatusFilter(event.target.value)}
              >
                <option value="approved">已审核</option>
                <option value="pending">待审核</option>
                <option value="rejected">已驳回</option>
                <option value="">全部状态</option>
              </select>
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
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
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
              <p className="mt-1 text-sm text-slate-500">当前只初始化管理员与只读访问账号，密码不在页面中显示。</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadDashboardData}>
              刷新
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">用户名</th>
                  <th className="px-5 py-3">显示名称</th>
                  <th className="px-5 py-3">角色</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appUsers.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-3 font-medium">{user.username}</td>
                    <td className="px-5 py-3 text-slate-600">{user.display_name}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{formatRole(user.role)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          user.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {user.is_active ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{user.role === 'admin' ? '可管理记录、审核和系统数据' : '只能查看数据与明细'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">发包/抢包用户名单</h2>
            <p className="mt-1 text-sm text-slate-500">这些用户来自现有数据，录入时作为发包人与抢包人的预设选择。</p>
          </div>

          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((participant) => (
              <div key={participant.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-medium">{participant.name}</p>
                  <p className="mt-1 text-xs text-slate-500">参与者 ID：{participant.id}</p>
                </div>
                <span
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    participant.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {participant.is_active ? '可选择' : '已停用'}
                </span>
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
    if (activeView === 'entry') {
      return renderEntry()
    }
    if (activeView === 'records') {
      return renderRecords()
    }
    if (activeView === 'review') {
      return renderReviewQueue()
    }
    if (activeView === 'users') {
      return renderUsers()
    }
    if (activeView === 'import') {
      return renderImport()
    }
    return renderDashboard()
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
                if (adminOnlyViews.has(item.key) && currentRole !== 'admin') {
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
              <p className="text-sm font-medium text-slate-900">迁移准备</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                旧 JSON 已能导入 SQLite。新记录审核通过后才进入统计。
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
                  本地原型 · {loading ? '正在读取后端' : '已连接后端数据'}
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
                  管理员录入
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
    </main>
  )
}

export default App
