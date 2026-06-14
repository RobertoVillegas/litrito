import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

export const Route = createFileRoute('/entrar')({ component: SignIn })

type AuthResult = {
  error?: { message?: string } | null
}

export function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = (await authClient.signIn.email({ email, password })) as AuthResult

      if (result.error) {
        throw new Error(result.error.message ?? 'Sign in failed')
      }

      track('login')
      navigate({ to: '/perfil' })
    } catch {
      setError('Correo o contraseña incorrectos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Accede para sincronizar tus gasolineras favoritas."
      footer={
        <div className="space-y-5">
          <p className="text-center">
            <Link
              to="/recuperar"
              className="text-body underline-offset-2 hover:text-ink hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          <div className="border-t border-line pt-5 text-center">
            <p>¿No tienes cuenta?</p>
            <Button render={<Link to="/registro" />} variant="outline" fullWidth className="mt-3">
              Crear cuenta
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
        <Input
          id="signin-email"
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
        <Input
          id="signin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          label="Contraseña"
          hideLabel
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
        />
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      </form>
    </AuthLayout>
  )
}
