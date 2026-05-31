import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Database,
  Gift,
  LockKeyhole,
  LineChart,
  ListChecks,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import type { ElementType } from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  getRecentRecords,
  getSummaryStats,
  getUserStats,
  type RecordListItem,
  type SummaryStats,
  type UserStatsItem,
} from './api'
import { Button } from '@/components/ui/button'
import './App.css'

type SummaryItem = {
  label: string
  value: string
  helper: string
  icon: ElementType
}

const navItems = [
  { label: '录入', icon: Plus, active: true },
  { label: '记录列表', icon: ListChecks },
  { label: '统计', icon: BarChart3 },
  { label: '审核队列', icon: LockKeyhole },
  { label: '用户管理', icon: Users },
  { label: '数据导入', icon: Database },
]

const trendPoints = [42, 58, 50, 74, 64, 88, 80, 96]

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

function App() {
  const [summary, setSummary] = useState<SummaryStats>(fallbackSummary)
  const [records, setRecords] = useState<RecordListItem[]>([])
  const [userStats, setUserStats] = useState<UserStatsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      try {
        setLoading(true)
        const [summaryData, recordData, userStatsData] = await Promise.all([
          getSummaryStats(),
          getRecentRecords(6),
          getUserStats(),
        ])

        if (!active) {
          return
        }

        setSummary(summaryData)
        setRecords(recordData)
        setUserStats(userStatsData.slice(0, 6))
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

  const maxAbsPnl = Math.max(1, ...userStats.map((item) => Math.abs(toNumber(item.pnl_amount))))

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

                return (
                  <a
                    key={item.label}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      item.active
                        ? 'bg-red-50 text-red-700 ring-1 ring-red-100'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                    href="#"
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </a>
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
                <h1 className="mt-1 truncate text-2xl font-semibold tracking-normal">红包记录管理工作台</h1>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" className="hidden sm:inline-flex">
                  <Search className="size-4" />
                  搜索记录
                </Button>
                <Button className="bg-red-600 text-white hover:bg-red-700">
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

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summaryItems.map((item) => {
                const Icon = item.icon

                return (
                  <article key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-500">{item.label}</p>
                        <p className="mt-2 text-2xl font-semibold">{item.value}</p>
                      </div>
                      <div className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-700">
                        <Icon className="size-5" />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{item.helper}</p>
                  </article>
                )
              })}
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[420px_1fr]">
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h2 className="text-base font-semibold">快速录入</h2>
                  <p className="mt-1 text-sm text-slate-500">当前仅管理员可录入；后续可开放协作录入并进入审核。</p>
                </div>

                <div className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-medium text-slate-500">时间</span>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        2026-05-31 15:30:00
                      </div>
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
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm">
                          {amount}
                        </div>
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

              <div className="grid gap-5">
                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <div>
                      <h2 className="text-base font-semibold">最近记录</h2>
                      <p className="mt-1 text-sm text-slate-500">只有审核通过的记录进入正式统计。</p>
                    </div>
                    <Button variant="outline" size="sm">
                      查看全部
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

                <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold">用户盈亏排行</h2>
                        <p className="mt-1 text-sm text-slate-500">盈亏 = 抢包金额 - 发包金额。</p>
                      </div>
                      <LineChart className="size-5 text-slate-400" />
                    </div>

                    <div className="mt-5 space-y-4">
                      {userStats.map((user) => {
                        const pnl = toNumber(user.pnl_amount)
                        const width = `${Math.max(12, (Math.abs(pnl) / maxAbsPnl) * 100)}%`
                        const positive = pnl >= 0

                        return (
                          <div
                            key={user.participant_id}
                            className="grid gap-2 sm:grid-cols-[92px_1fr_92px] sm:items-center"
                          >
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-slate-500">发包率 {user.send_ratio}</p>
                            </div>
                            <div className="h-9 rounded-lg bg-slate-100 p-1">
                              <div
                                className={`h-full rounded-md ${positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                                style={{ width }}
                              />
                            </div>
                            <div className={`text-right font-semibold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                              {positive ? '+' : ''}
                              {user.pnl_amount}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-semibold">趋势预览</h2>
                        <p className="mt-1 text-sm text-slate-500">累计盈亏折线图占位。</p>
                      </div>
                      <Settings className="size-5 text-slate-400" />
                    </div>

                    <div className="mt-6 flex h-36 items-end gap-2">
                      {trendPoints.map((point, index) => (
                        <div key={`${point}-${index}`} className="flex flex-1 items-end rounded-md bg-slate-100">
                          <div className="w-full rounded-md bg-red-500" style={{ height: `${point}%` }} />
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-slate-500">平均每包</p>
                        <p className="mt-1 font-semibold">
                          {userStats[0] ? formatMoney(userStats[0].average_receive_amount) : '¥0'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-slate-500">待审核</p>
                        <p className="mt-1 font-semibold text-amber-700">{summary.pending_count} 条</p>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
