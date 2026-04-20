import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/pools')
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4 text-center">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">CFB Pickem</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Draft your college football teams, compete with friends, and track your wins all season long.
        </p>
      </div>
      <div className="flex gap-4">
        <Link href="/signup" className={buttonVariants({ size: 'lg' })}>
          Get Started
        </Link>
        <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
          Sign In
        </Link>
      </div>
    </div>
  )
}
