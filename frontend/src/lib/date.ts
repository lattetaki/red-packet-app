import type { StatsRangePreset } from '@/types/app'

export function currentDateTimeLocal() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 16)
}

export function toDateTimeLocal(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return currentDateTimeLocal()
  }
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function toDateInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function presetStartDate(preset: Exclude<StatsRangePreset, 'custom'>) {
  const date = startOfDay(new Date())
  if (preset === 'week') date.setDate(date.getDate() - 6)
  if (preset === 'month') date.setMonth(date.getMonth() - 1)
  if (preset === 'quarter') date.setMonth(date.getMonth() - 3)
  return date
}
