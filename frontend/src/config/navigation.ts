import {
  Bell,
  BookOpen,
  ClipboardList,
  Database,
  Download,
  Home,
  ListChecks,
  LockKeyhole,
  Plus,
  RotateCcw,
  Trophy,
  UserCircle,
  Users,
} from 'lucide-react'
import type { ElementType } from 'react'

import type { ViewKey } from '@/types/app'

export const navItems: Array<{ label: string; icon: ElementType; key: ViewKey }> = [
  { label: '首页', icon: Home, key: 'dashboard' },
  { label: '个人主页', icon: UserCircle, key: 'profile' },
  { label: '录入', icon: Plus, key: 'entry' },
  { label: '记录列表', icon: ListChecks, key: 'records' },
  { label: '记录统计', icon: Trophy, key: 'recordStats' },
  { label: '更新公告', icon: BookOpen, key: 'announcements' },
  { label: '弹窗公告', icon: Bell, key: 'popupNotices' },
  { label: '审核队列', icon: LockKeyhole, key: 'review' },
  { label: '已删除记录', icon: RotateCcw, key: 'deleted' },
  { label: '用户管理', icon: Users, key: 'users' },
  { label: '备份管理', icon: Download, key: 'backup' },
  { label: '数据导入', icon: Database, key: 'import' },
  { label: '访问记录', icon: ClipboardList, key: 'activityLogs' },
]

export const viewerVisibleViews = new Set<ViewKey>(['dashboard', 'profile', 'entry', 'records', 'recordStats', 'announcements'])
export const superAdminOnlyViews = new Set<ViewKey>(['activityLogs'])
