import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// The verify endpoint only appends ?code= — it doesn't carry ?type= through.
// The granted session records how it was obtained, so read that instead of
// trusting the query string to tell us this was a recovery.
function isRecoverySession(accessToken: string | undefined) {
  if (!accessToken) return false
  try {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64url').toString()
    )
    return (payload.amr ?? []).some(
      (entry: { method?: string }) => entry.method === 'recovery'
    )
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  // Only allow same-origin paths (prevents open redirects via ?next=)
  const rawNext = searchParams.get('next') ?? '/pools'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/pools'
  // Password recovery must land on the set-new-password form, never the app
  const dest = type === 'recovery' ? '/reset-password' : next

  const supabase = await createClient()

  // Handle OAuth / PKCE code exchange
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const recovery = isRecoverySession(data.session?.access_token)
      return NextResponse.redirect(`${origin}${recovery ? '/reset-password' : dest}`)
    }
  }

  // Handle email confirmation token hash
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })
    if (!error) {
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
