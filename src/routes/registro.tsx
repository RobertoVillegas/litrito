import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { AuthLayout, authInputClass } from '../components/AuthLayout'

export const Route = createFileRoute('/registro')({ component: SignUp })

type AuthResult = {
  error?: { message?: string } | null
}

export function SignUp() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = (await authClient.signUp.email({
        email,
        password,
        name: name || email.split('@')[0] || 'Litrito',
      })) as AuthResult

      if (result.error) {
        throw new Error(result.error.message ?? 'Sign up failed')
      }

      track('signup')
      navigate({ to: '/perfil' })
    } catch {
      setError('No se pudo crear la cuenta. ¿Ya existe ese correo?')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Guarda tus gasolineras favoritas y llévalas a donde sea."
      footer={
        <div className="border-t border-line pt-5 text-center">
          <p>¿Ya tienes cuenta?</p>
          <Link to="/entrar" className="btn-pill btn-pill--outline-dark mt-3 w-full">
            Entrar
          </Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className={authInputClass}
        />
        <input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={authInputClass}
        />
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mínimo 8 caracteres)"
          className={authInputClass}
        />
        <button
          type="submit"
          disabled={submitting}
          className="btn-pill btn-pill--primary w-full disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </button>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      </form>
    </AuthLayout>
  )
}
