import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

export const Route = createFileRoute('/restablecer')({
  component: ResetPassword,
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
})

type Resetter = {
  resetPassword?: (a: { newPassword: string; token: string }) => Promise<AuthResult>
}

type AuthResult = {
  error?: { message?: string } | null
}

function ResetPassword() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const client = authClient as unknown as Resetter
      const result = await client.resetPassword?.({ newPassword: password, token })

      if (result?.error) {
        throw new Error(result.error.message ?? 'Password reset failed')
      }

      setDone(true)
      setTimeout(() => navigate({ to: '/entrar' }), 1500)
    } catch {
      setError('El enlace es inválido o expiró. Solicita uno nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Nueva contraseña"
      subtitle="Elige una contraseña nueva para tu cuenta."
      footer={
        <p className="text-center">
          <Link
            to="/recuperar"
            className="text-body underline-offset-2 hover:text-ink hover:underline"
          >
            Solicitar otro enlace
          </Link>
        </p>
      }
    >
      {!token ? (
        <p className="rounded-[6px] border border-line bg-canvas-soft px-4 py-3 text-sm text-ink">
          Falta el enlace de restablecimiento. Ábrelo desde el correo que te
          enviamos.
        </p>
      ) : done ? (
        <p className="rounded-[6px] border border-line bg-canvas-soft px-4 py-3 text-sm text-ink">
          Contraseña actualizada. Te llevamos a iniciar sesión…
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
          <Input
            id="reset-password"
            name="new-password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            label="Nueva contraseña"
            hideLabel
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nueva contraseña (mínimo 8)"
          />
          <Button type="submit" fullWidth disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
          {error && <p className="text-sm font-semibold text-brand">{error}</p>}
        </form>
      )}
    </AuthLayout>
  )
}
