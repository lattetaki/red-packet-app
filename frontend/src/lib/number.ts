export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function toNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function toRatioNumber(value: string) {
  if (value === '-') return -1
  return toNumber(value.replace('%', ''))
}
