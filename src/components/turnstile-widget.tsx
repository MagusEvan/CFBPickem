'use client'

import { forwardRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

/** Captcha is active only when the site key is configured (and Turnstile is enabled in Supabase). */
export const captchaEnabled = Boolean(SITE_KEY)

/**
 * Cloudflare Turnstile widget. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is unset so auth pages keep working before captcha is configured.
 * Call `ref.current?.reset()` after a failed auth attempt (tokens are single-use).
 */
export const TurnstileWidget = forwardRef<
  TurnstileInstance,
  { onToken: (token: string | null) => void }
>(function TurnstileWidget({ onToken }, ref) {
  if (!SITE_KEY) return null
  return (
    <Turnstile
      ref={ref}
      siteKey={SITE_KEY}
      onSuccess={onToken}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
      options={{ size: 'flexible' }}
    />
  )
})
