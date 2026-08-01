import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { Button } from '#/components/ui/button'

type Provider = 'google' | 'facebook'
type Enabled = { google: boolean; facebook: boolean }

// Renders nothing until the backend confirms which providers are configured, so
// a button never shows for a provider missing from the server env. `initial` is
// the SSR-prefetched value from the route loader; using it as the fallback
// avoids a flash where the buttons pop in after the live query resolves.
export function SocialSignIn({
  verb,
  initial,
}: {
  verb: 'Continuar' | 'Registrarte'
  initial?: Enabled
}) {
  const enabled = initial
  // Tracks which provider kicked off a redirect so only that button shows a
  // loading state.
  const [pending, setPending] = useState<Provider | null>(null)

  if (!enabled || (!enabled.google && !enabled.facebook)) return null

  const start = (provider: Provider) => {
    setPending(provider)
    track(`login_${provider}`)
    // Better Auth redirects the browser to the provider, so this promise never
    // resolves on success — only reset state if the kickoff fails.
    void authClient.signIn.social({ provider, callbackURL: '/perfil' }).catch(() => {
      setPending(null)
    })
  }

  return (
    <div className="mb-5 space-y-3">
      {enabled.google && (
        <Button
          variant="outline"
          fullWidth
          disabled={pending !== null}
          onClick={() => start('google')}
        >
          <GoogleIcon />
          {pending === 'google' ? 'Conectando…' : `${verb} con Google`}
        </Button>
      )}
      {enabled.facebook && (
        <Button
          variant="outline"
          fullWidth
          disabled={pending !== null}
          onClick={() => start('facebook')}
        >
          <FacebookIcon />
          {pending === 'facebook' ? 'Conectando…' : `${verb} con Facebook`}
        </Button>
      )}
      <div className="flex items-center gap-3 pt-2 text-xs uppercase tracking-wide text-body">
        <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12c0-6.63-5.37-12-12-12S0 5.37 0 12c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08V12h3.05V9.36c0-3 1.79-4.67 4.53-4.67 1.31 0 2.69.24 2.69.24v2.95h-1.51c-1.49 0-1.96.93-1.96 1.87V12h3.33l-.53 3.47h-2.8v8.38C19.61 22.95 24 17.99 24 12Z"
      />
    </svg>
  )
}
