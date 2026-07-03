import type { ElementType } from 'react'

import type { AppUser, Participant, StatsParticipant } from '@/api'

export type ViewKey =
  | 'dashboard'
  | 'profile'
  | 'entry'
  | 'records'
  | 'recordStats'
  | 'announcements'
  | 'popupNotices'
  | 'review'
  | 'deleted'
  | 'users'
  | 'backup'
  | 'import'

export type SummaryItem = {
  label: string
  value: string
  helper: string
  icon: ElementType
}

export type EntryClaim = {
  id: string
  participantId: string
  amount: string
}

export type AppUserDraft = {
  displayName: string
  participantId: string
  role: AppUser['role']
  isActive: boolean
  password: string
}

export type AuthSession = {
  user: AppUser
  token: string
}

export type LayoutMode = 'auto' | 'mobile' | 'desktop'
export type StatsRangePreset = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'custom'

export type TouchPoint = {
  x: number
  y: number
}

export type AvatarCropState = {
  participant: Participant | StatsParticipant
  mode: 'participant' | 'self'
  sourceUrl: string
  imageWidth: number
  imageHeight: number
  scale: number
  offsetX: number
  offsetY: number
  dragging: boolean
  dragStartX: number
  dragStartY: number
  dragOriginX: number
  dragOriginY: number
}
