import type { PopupNoticeCurrent } from '@/api'
import { Button } from '@/components/ui/button'

type PopupNoticeModalProps = {
  notice: PopupNoticeCurrent
  dismissed: boolean
  onDismissedChange: (value: boolean) => void
  onClose: () => void
}

export function PopupNoticeModal({ notice, dismissed, onDismissedChange, onClose }: PopupNoticeModalProps) {
  if (!notice) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-4">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold">{notice.title}</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            {notice.content}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={dismissed} onChange={(event) => onDismissedChange(event.target.checked)} />
            下次不再提醒这一条
          </label>
          <div className="flex justify-end">
            <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={onClose}>
              知道了
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
