import { Eye, EyeOff } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { useState } from 'react'

type PasswordFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  onEnter?: () => void
}

export function PasswordField({ label, value, onChange, autoComplete, onEnter }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const Icon = visible ? EyeOff : Eye

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && onEnter) {
      event.preventDefault()
      onEnter()
    }
  }

  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="relative">
        <input
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? '隐藏密码' : '显示密码'}
          title={visible ? '隐藏密码' : '显示密码'}
        >
          <Icon className="size-4" />
        </button>
      </div>
    </label>
  )
}
