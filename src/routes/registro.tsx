import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

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
          <Button render={<Link to="/entrar" />} variant="outline" fullWidth className="mt-3">
            Entrar
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" autoComplete="on">
        <Input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          label="Nombre (opcional)"
          hideLabel
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
        />
        <Input
          id="signup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          label="Email"
          hideLabel
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <Input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          label="Contraseña"
          hideLabel
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña (mínimo 8 caracteres)"
        />
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? 'Creando…' : 'Crear cuenta'}
        </Button>
        {error && <p className="text-sm font-semibold text-brand">{error}</p>}
      </form>
    </AuthLayout>
  )
}
