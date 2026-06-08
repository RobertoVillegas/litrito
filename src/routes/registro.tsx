import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { AuthLayout, authInputClass } from '../components/AuthLayout'

export const Route = createFileRoute('/registro')({ component: SignUp })

function SignUp() {
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
      await authClient.signUp.email({
        email,
        password,
        name: name || email.split('@')[0] || 'Litrito',
      })
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
        <span>
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-bold text-brand hover:text-brand-dark">
            Entrar
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className={authInputClass}
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className={authInputClass}
        />
        <input
          type="password"
          required
          minLength={8}
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
