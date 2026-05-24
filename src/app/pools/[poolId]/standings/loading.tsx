import { Spinner } from '@/components/ui/spinner'

export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-3 py-24">
      <Spinner className="h-6 w-6" />
      <p className="text-sm text-muted-foreground">Loading standings...</p>
    </div>
  )
}
