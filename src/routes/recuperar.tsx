import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

export const Route = createFileRoute('/recuperar')({ component: ForgotPassword })

// Method name varies across better-auth versions; resolve defensively.
type ResetRequester = {
  requestPasswordReset?: (a: { email: string; redirectTo?: string }) => Promise<AuthResult>
  forgetPassword?: (a: { email: string; redirectTo?: string }) => Promise<AuthResult>
}

type AuthResult = {
  error?: { message?: string } | null
}

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const client = authClient as unknown as ResetRequester
      const request = client.requestPasswordReset ?? client.forgetPassword
      const result = await request?.({
        email,
        redirectTo: `${window.location.origin}/restablecer`,
      })

      if (result?.error) {
        throw new Error(result.error.message ?? 'Password reset request failed')
      }
    } catch {
      // Ignore — we always show the same message to avoid leaking which
      // emails are registered.
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  return (
    <AuthLayout
      title="Recuperar"
      subtitle="Te enviamos un enlace para restablecer tu contraseña."
      footer={
        <p className="text-center">
          <Link
            to="/entrar"
            className="text-body underline-offset-2 hover:text-ink hover:underline"
          >
            Volver a entrar
          </Link>
        </p>
      }
    >
      {sent ? (
        <p className="rounded-[6px] border border-line bg-canvas-soft px-4 py-3 text-sm text-ink">
          Si <span className="font-semibold">{email}</span> tiene una cuenta, te
          llegará un correo con el enlace para restablecer tu contraseña.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
          <Input
            id="recover-email"
            name="email"
            type="email"
            required
            autoComplete="username"
            inputMode="email"
            label="Email"
            hideLabel
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar enlace'}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
