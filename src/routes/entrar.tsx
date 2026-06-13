import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { AuthLayout, authInputClass } from '../components/AuthLayout'

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
        <>
          <Link to="/recuperar" className="font-bold text-brand hover:text-brand-dark">
            ¿Olvidaste tu contraseña?
          </Link>
          <span className="mt-2 block">
            ¿No tienes cuenta?{' '}
            <Link to="/registro" className="font-bold text-brand hover:text-brand-dark">
              Crear una
            </Link>
          </span>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
        <input
          id="signin-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={authInputClass}
        />
        <input
          id="signin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className={authInputClass}
        />
        <button
          type="submit"
          disabled={submitting}
          className="btn-pill btn-pill--primary w-full disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      </form>
    </AuthLayout>
  )
}
