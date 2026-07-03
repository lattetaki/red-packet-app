import type { TrendPoint } from '@/api'
import { formatMoney } from '@/lib/format'
import { toNumber } from '@/lib/number'

const chartColors = ['#dc2626', '#059669', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#4f46e5']

export function TrendLineChart({ trends, selectedIds }: { trends: TrendPoint[]; selectedIds: Set<number> }) {
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
  const finalValues = series
    .map((item) => ({ ...item, finalValue: item.values[item.values.length - 1] ?? 0 }))
    .sort((a, b) => b.finalValue - a.finalValue)

  const allValues = series.flatMap((item) => item.values)
  const minValue = Math.min(0, ...allValues)
  const maxValue = Math.max(0, ...allValues)
  const span = maxValue - minValue || 1
  const width = 720
  const height = 260
  const padding = { top: 18, right: 20, bottom: 28, left: 62 }
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
    <div className="grid gap-3 xl:grid-cols-[1fr_180px]">
      <div className="overflow-x-auto">
        <svg className="min-w-[720px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="累计盈亏趋势折线图">
          <rect x={padding.left} y={padding.top} width={plotWidth} height={plotHeight} rx="8" fill="#f8fafc" />
          {[0, 1, 2, 3, 4].map((tick) => {
            const y = padding.top + (tick / 4) * plotHeight
            const value = maxValue - (tick / 4) * span

            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e2e8f0" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-slate-600 text-[11px] font-medium">
                  ¥{value.toFixed(0)}
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
                <path d={path} fill="none" stroke={item.color} strokeWidth="1.6" />
                {points.slice(-1).map((point) => (
                  <circle key={`${item.participantId}-${point.x}`} cx={point.x} cy={point.y} r="2.8" fill={item.color} />
                ))}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3 xl:block xl:space-y-2">
        {finalValues.map((item) => (
          <div key={item.participantId} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 xl:bg-white xl:px-0">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className={`shrink-0 font-semibold ${item.finalValue >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatMoney(item.finalValue.toFixed(2))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
