import { Gift } from 'lucide-react'

import { PasswordField } from '@/components/common/PasswordField'
import { Button } from '@/components/ui/button'

type LoginPageProps = {
  username: string
  password: string
  error: string | null
  loggingIn: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onLogin: () => void | Promise<void>
}

export function LoginPage({ username, password, error, loggingIn, onUsernameChange, onPasswordChange, onLogin }: LoginPageProps) {
  const submit = () => {
    void onLogin()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f7fb] px-4 text-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
            <Gift className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">红包履历统计</h1>
            <p className="mt-1 text-sm text-slate-500">登录后进入 Web 工作台</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-500">用户名</span>
            <input
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
              value={username}
              onChange={(event) => onUsernameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
              autoComplete="username"
            />
          </label>

          <PasswordField label="密码" value={password} onChange={onPasswordChange} onEnter={submit} autoComplete="current-password" />

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

          <Button className="w-full bg-slate-950 text-white hover:bg-slate-800" onClick={submit} disabled={loggingIn}>
            {loggingIn ? '登录中' : '登录'}
          </Button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
          普通用户只能查看首页、提交录入和查看已审核记录；管理员可以审核、管理用户和维护数据。
        </div>
      </section>
    </main>
  )
}
