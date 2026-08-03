import Image from 'next/image'
import { CFB_CONFERENCE_LOGOS } from '@/lib/games/registry'

/**
 * Conference mark for CFB pools. Decorative — every call site renders the
 * conference name alongside it, so the alt stays empty.
 *
 * Several of these logos are solid black or navy on transparency (Big Ten,
 * MAC, C-USA, Pac-12), which disappears against a dark background, so in dark
 * mode they sit on a light plate.
 */
export function ConferenceLogo({
  conferenceKey,
  size = 20,
  className = '',
}: {
  conferenceKey: string
  size?: number
  className?: string
}) {
  const src = CFB_CONFERENCE_LOGOS[conferenceKey]
  if (!src) return null

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm dark:bg-white/90 dark:p-px ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
      />
    </span>
  )
}
