import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
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
  getRecentRecords,
  getSummaryStats,
  getTrendPoints,
  getUserStats,
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

type NavItem = {
  label: string
  icon: ElementType
  key: ViewKey
}

type ChartPoint = {
  x: number
  y: number
}

const navItems: NavItem[] = [
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

function buildLatestTrendByUser(points: TrendPoint[]) {
  const latest = new Map<number, TrendPoint>()

  for (const point of points) {
    latest.set(point.participant_id, point)
  }

  return Array.from(latest.values()).sort((a, b) => toNumber(b.pnl_amount) - toNumber(a.pnl_amount))
}

function buildUserSeries(points: TrendPoint[], selectedIds: Set<number>) {
  const grouped = new Map<number, TrendPoint[]>()

  for (const point of points) {
    if (!selectedIds.has(point.participant_id)) {
      continue
    }

    grouped.set(point.participant_id, [...(grouped.get(point.participant_id) ?? []), point])
  }

  return Array.from(grouped.entries()).map(([participantId, values], index) => ({
    participantId,
    name: values[0]?.participant_name ?? `用户 ${participantId}`,
    color: chartColors[index % chartColors.length],
    values: values.map((item) => toNumber(item.pnl_amount)),
  }))
}

function makeLinePath(points: ChartPoint[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

function TrendLineChart({ trends, selectedIds }: { trends: TrendPoint[]; selectedIds: Set<number> }) {
  const series = buildUserSeries(trends, selectedIds)
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

          return (
            <g key={item.participantId}>
              <path d={makeLinePath(points)} fill="none" stroke={item.color} strokeWidth="2.5" />
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
  const [selectedTrendUserIds, setSelectedTrendUserIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        setLoading(true)
        const [summaryData, recordData, userStatsData, trendData] = await Promise.all([
          getSummaryStats(),
          getRecentRecords(30),
          getUserStats(),
          getTrendPoints(),
        ])

        if (!active) {
          return
        }

        setSummary(summaryData)
        setRecords(recordData)
        setUserStats(userStatsData)
        setTrendPoints(trendData)
        setSelectedTrendUserIds(new Set(userStatsData.map((item) => item.participant_id)))
        setApiError(null)
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

    loadDashboard()

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

  function renderDashboard() {
    return (
      <>
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

            <div>
              <TrendLineChart trends={trendPoints} selectedIds={selectedTrendUserIds} />
            </div>
          </div>
        </section>
      </>
    )
  }

  function renderEntry() {
    return (
      <section className="grid gap-5 xl:grid-cols-[420px_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold">快速录入</h2>
            <p className="mt-1 text-sm text-slate-500">当前仅管理员可录入；后续可开放协作录入并进入审核。</p>
          </div>

          <div className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">时间</span>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">2026-05-31 15:30:00</div>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-500">发包人</span>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                  从名单选择
                  <ChevronDown className="size-4 text-slate-400" />
                </div>
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-500">红包总额</span>
              <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                ¥10
                <ChevronDown className="size-4" />
              </div>
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              人名来自预设用户名单，只能点击选择，避免同一个人出现多个写法。
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">抢包明细</span>
                <Button variant="outline" size="xs">
                  <Plus className="size-3" />
                  加一行
                </Button>
              </div>

              {[
                ['用户 A', '1.80'],
                ['用户 B', '2.10'],
                ['用户 C', '0.40'],
                ['用户 D', '1.70'],
              ].map(([name, amount]) => (
                <div key={name} className="grid grid-cols-[1fr_112px] gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    {name}
                    <ChevronDown className="size-4 text-slate-400" />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm">{amount}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              明细合计 ¥6.00，与总额不一致时保存前会提示确认。
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                清空当前输入
              </Button>
              <Button className="flex-1 bg-slate-950 text-white hover:bg-slate-800">保存并进入审核</Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">录入说明</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            下一步会把这里从展示态改成真实表单：发包人和抢包人从名单选择，金额默认 10，可修改，保存后进入审核队列。
          </p>
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
