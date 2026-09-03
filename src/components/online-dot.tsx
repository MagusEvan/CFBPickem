const ONLINE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

export function isOnline(lastActiveAt: string | null | undefined): boolean {
  if (!lastActiveAt) return false
  return Date.now() - new Date(lastActiveAt).getTime() < ONLINE_THRESHOLD_MS
}

export function OnlineDot({ lastActiveAt }: { lastActiveAt: string | null | undefined }) {
  if (!isOnline(lastActiveAt)) return null
  return (
    <span
      className="ml-1 inline-block h-2 w-2 rounded-full bg-green-500"
      title="Online"
    />
  )
}
