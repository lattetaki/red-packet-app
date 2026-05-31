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

import { Button } from '@/components/ui/button'
import './App.css'

type SummaryItem = {
  label: string
  value: string
  helper: string
  icon: ElementType
}

type RecordItem = {
  id: string
  time: string
  sender: string
  total: string
  claims: number
  claimed: string
  note: string
}

type UserStat = {
  name: string
  sent: string
  received: string
  average: string
  pnl: number
  ratio: string
}

const navItems = [
  { label: '录入', icon: Plus, active: true },
  { label: '记录列表', icon: ListChecks },
  { label: '统计', icon: BarChart3 },
  { label: '审核队列', icon: LockKeyhole },
  { label: '用户管理', icon: Users },
  { label: '数据导入', icon: Database },
]

const summaryItems: SummaryItem[] = [
  {
    label: '红包记录数',
    value: '3,842',
    helper: '来自旧 JSON 的历史规模预估',
    icon: BookOpen,
  },
  {
    label: '参与用户',
    value: '42',
    helper: '自动维护发包人与抢包人',
    icon: Users,
  },
  {
    label: '累计发包金额',
    value: '¥286,540',
    helper: '按红包总额汇总',
    icon: Gift,
  },
  {
    label: '累计抢包金额',
    value: '¥285,920',
    helper: '按抢包明细汇总',
    icon: CircleDollarSign,
  },
]

const recentRecords: RecordItem[] = [
  {
    id: 'HB-2408',
    time: '2026-05-30 22:18',
    sender: '阿明',
    total: '¥100',
    claims: 8,
    claimed: '¥100',
    note: '周末群红包',
  },
  {
    id: 'HB-2407',
    time: '2026-05-29 20:04',
    sender: '小林',
    total: '¥50',
    claims: 5,
    claimed: '¥49.98',
    note: '测试手气',
  },
  {
    id: 'HB-2406',
    time: '2026-05-28 18:42',
    sender: '老陈',
    total: '¥200',
    claims: 12,
    claimed: '¥200',
    note: '聚餐结算',
  },
  {
    id: 'HB-2405',
    time: '2026-05-27 23:10',
    sender: '小周',
    total: '¥88',
    claims: 7,
    claimed: '¥88',
    note: '生日红包',
  },
]

const userStats: UserStat[] = [
  { name: '阿明', sent: '¥4,260', received: '¥5,118', average: '¥18.21', pnl: 858, ratio: '31.4%' },
  { name: '小林', sent: '¥3,880', received: '¥3,120', average: '¥14.86', pnl: -760, ratio: '42.1%' },
  { name: '老陈', sent: '¥2,420', received: '¥2,980', average: '¥21.59', pnl: 560, ratio: '27.8%' },
  { name: '小周', sent: '¥1,680', received: '¥1,440', average: '¥12.00', pnl: -240, ratio: '35.0%' },
]

const trendPoints = [42, 58, 50, 74, 64, 88, 80, 96]

function App() {
  const maxAbsPnl = Math.max(...userStats.map((item) => Math.abs(item.pnl)))

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
                旧 JSON 会先校验，再导入 SQLite。新记录审核通过后才进入统计。
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
                  本地原型 · Mock Data
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
                        阿明
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
                      ['小林', '1.80'],
                      ['老陈', '2.10'],
                      ['小周', '0.40'],
                      ['阿晴', '1.70'],
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
                        {recentRecords.map((record) => (
                          <tr key={record.id} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-5 py-3 text-slate-600">{record.time}</td>
                            <td className="px-5 py-3 font-medium">{record.sender}</td>
                            <td className="px-5 py-3">{record.total}</td>
                            <td className="px-5 py-3">{record.claims}</td>
                            <td className="px-5 py-3">{record.claimed}</td>
                            <td className="px-5 py-3 text-slate-500">{record.note}</td>
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
                        const width = `${Math.max(12, (Math.abs(user.pnl) / maxAbsPnl) * 100)}%`
                        const positive = user.pnl >= 0

                        return (
                          <div key={user.name} className="grid gap-2 sm:grid-cols-[92px_1fr_92px] sm:items-center">
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-slate-500">发包率 {user.ratio}</p>
                            </div>
                            <div className="h-9 rounded-lg bg-slate-100 p-1">
                              <div
                                className={`h-full rounded-md ${positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                                style={{ width }}
                              />
                            </div>
                            <div className={`text-right font-semibold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                              {positive ? '+' : ''}
                              {user.pnl}
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
                        <p className="mt-1 font-semibold">¥16.84</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-slate-500">异常记录</p>
                        <p className="mt-1 font-semibold text-amber-700">12 条</p>
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
