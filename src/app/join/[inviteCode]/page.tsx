import { getPoolByInviteCode, getCurrentUserId } from '@/lib/pools/queries'
import { joinPool } from '@/lib/pools/actions'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'

export const revalidate = 60

export default async function JoinPoolPage({ params }: { params: Promise<{ inviteCode: string }> }) {
  const { inviteCode } = await params
  const pool = await getPoolByInviteCode(inviteCode)
  const userId = await getCurrentUserId()

  if (!pool) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>This invite link is not valid or has expired.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!userId) {
    redirect(`/login?next=/join/${inviteCode}`)
  }

  // Check if user is already a member
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('pool_members')
    .select('id')
    .eq('pool_id', pool.id)
    .eq('user_id', userId)
    .single()

  if (existing) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>{pool.name}</CardTitle>
            <CardDescription>You&apos;re already a member of this pool.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Link href={`/pools/${pool.id}`} className={buttonVariants({ size: 'lg' })}>
              Go to Pool
            </Link>
          </CardFooter>
        </Card>
      </div>
    )
  }

  const poolLabel = pool.game_type === 'world_cup'
    ? `World Cup ${pool.season_year}`
    : `${pool.season_year} Season`

  async function handleJoin() {
    'use server'
    await joinPool(inviteCode)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>Join Pool</CardTitle>
          <CardDescription>You&apos;ve been invited to join a draft pool</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xl font-bold">{pool.name}</p>
          <p className="text-muted-foreground">{poolLabel}</p>
        </CardContent>
        <CardFooter className="justify-center">
          <form action={handleJoin}>
            <Button type="submit" size="lg">Join Pool</Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  )
}
