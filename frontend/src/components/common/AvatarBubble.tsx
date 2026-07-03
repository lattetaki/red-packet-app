import type { Participant, StatsParticipant } from '@/api'
import { initials } from '@/lib/format'

export function AvatarBubble({
  participant,
  size = 'md',
}: {
  participant: StatsParticipant | Participant
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const sizes = {
    sm: 'size-9 text-xs',
    md: 'size-11 text-sm',
    lg: 'size-14 text-base',
    xl: 'size-20 text-xl',
  }

  return (
    <div className={`shrink-0 overflow-hidden rounded-lg bg-red-50 font-semibold text-red-700 ring-1 ring-red-100 ${sizes[size]}`}>
      {participant.avatar_data_url ? (
        <img className="size-full object-cover" src={participant.avatar_data_url} alt={`${participant.name} avatar`} />
      ) : (
        <div className="flex size-full items-center justify-center">{initials(participant.name)}</div>
      )}
    </div>
  )
}
