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
  createRecord,
  getAmountPresets,
  getParticipants,
  getRecentRecords,
  getSummaryStats,
  getTrendPoints,
  getUserStats,
  type AmountPreset,
  type Participant,
  type RecordCreatePayload,
  type RecordListItem,
  type SummaryStats,
  type TrendPoint,
  type UserStatsItem,
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

function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function currentDateTimeLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
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
  const [userStats, setUserStats] = useState<UserStatsItem[]>([])
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
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
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  async function loadDashboardData() {
    const [summaryData, recordData, userStatsData, trendData, participantData, presetData] = await Promise.all([
      getSummaryStats(),
      getRecentRecords(30),
      getUserStats(),
      getTrendPoints(),
      getParticipants(),
      getAmountPresets(),
    ])

    setSummary(summaryData)
    setRecords(recordData)
    setUserStats(userStatsData)
    setTrendPoints(trendData)
    setParticipants(participantData)
    setAmountPresets(presetData)
    setSelectedTrendUserIds((current) => (current.size ? current : new Set(userStatsData.map((item) => item.participant_id))))
    setSenderId((current) => current || String(participantData[0]?.id ?? ''))
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
      time: entryTime ? new Date(entryTime).toISOString() : undefined,
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

  function renderRecords() {
    return (
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">记录列表</h2>
            <p className="mt-1 text-sm text-slate-500">当前展示最近 30 条已审核记录。</p>
          </div>
          <Button variant="outline" size="sm">
            筛选
          </Button>
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
                <tr key={record.id} className="hover:bg-slate-50/70">
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
      return renderPlaceholder('审核队列', '后续协作录入开放后，待审核记录会集中显示在这里。')
    }
    if (activeView === 'users') {
      return renderPlaceholder('用户管理', '后续这里会管理预设用户名单和登录账号权限。')
    }
    if (activeView === 'import') {
      return renderPlaceholder('数据导入', '旧 JSON 导入能力已经在后端具备，后续会加一个管理界面。')
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
