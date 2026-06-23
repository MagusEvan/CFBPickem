import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPgaProvider } from '@/lib/data-providers/pga/provider'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const year = Number(request.nextUrl.searchParams.get('year') || new Date().getFullYear())

  try {
    const provider = getPgaProvider()
    const events = await provider.getMajors(year)

    return NextResponse.json(
      { events },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } }
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch events' },
      { status: 500 }
    )
  }
}
