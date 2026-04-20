import { getPoolByInviteCode, getCurrentUserId } from '@/lib/pools/queries'
import { joinPool } from '@/lib/pools/actions'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
          <p className="text-muted-foreground">{pool.season_year} Season</p>
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
