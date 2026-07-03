import { setAuthToken } from '@/api'
import type { AuthSession, LayoutMode } from '@/types/app'

export const savedUserKey = 'red-packet-current-user'
export const senderDefaultsKey = 'red-packet-sender-default-amounts'
export const layoutModeKey = 'red-packet-layout-mode'

export function readSavedSession() {
  const raw = window.localStorage.getItem(savedUserKey)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>
    if (!parsed.user || !parsed.token) {
      window.localStorage.removeItem(savedUserKey)
      return null
    }
    setAuthToken(parsed.token)
    return parsed as AuthSession
  } catch {
    window.localStorage.removeItem(savedUserKey)
    return null
  }
}

export function readSenderDefaults() {
  const raw = window.localStorage.getItem(senderDefaultsKey)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    window.localStorage.removeItem(senderDefaultsKey)
    return {}
  }
}

export function readLayoutMode(): LayoutMode {
  const raw = window.localStorage.getItem(layoutModeKey)
  return raw === 'mobile' || raw === 'desktop' || raw === 'auto' ? raw : 'auto'
}
