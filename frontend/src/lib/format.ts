import type { AppUser } from '@/api'

export function formatMoney(amount: string) {
  return `¥${amount}`
}

export function formatTime(value: string) {
  return value.replace('T', ' ').slice(0, 19)
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

export function formatRole(role: AppUser['role']) {
  const labels: Record<AppUser['role'], string> = {
    super_admin: '超级管理员',
    admin: '管理员',
    viewer: '只读用户',
    contributor: '协助录入',
  }
  return labels[role] ?? role
}

export function formatStatus(status: string) {
  const labels: Record<string, string> = {
    approved: '已审核',
    pending: '待审核',
    rejected: '已驳回',
    cancelled: '已撤回',
  }
  return labels[status] ?? status
}
