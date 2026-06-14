import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { emailSchema, fieldError, newPasswordSchema } from '#/lib/forms'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from '../components/AuthLayout'

export const Route = createFileRoute('/registro')({
  head: () => ({
    meta: [{ title: 'Crear cuenta - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: SignUp,
})

type AuthResult = {
  error?: { message?: string } | null
}

export function SignUp() {
  const navigate = useNavigate()
  // Server rejection (e.g. email already in use) — shown inline on the email field.
  const [serverError, setServerError] = useState('')

  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      setServerError('')
      try {
        const result = (await authClient.signUp.email({
          email: value.email,
          password: value.password,
          name: value.name || value.email.split('@')[0] || 'Litrito',
        })) as AuthResult
        if (result.error) throw new Error(result.error.message ?? 'Sign up failed')
        track('signup')
        navigate({ to: '/perfil' })
      } catch {
        setServerError('No se pudo crear la cuenta. ¿Ya existe ese correo?')
      }
    },
  })

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
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit()
        }}
        className="space-y-3"
        autoComplete="on"
        noValidate
      >
        <form.Field
          name="name"
          children={(field) => (
            <Input
              id="signup-name"
              name={field.name}
              type="text"
              autoComplete="name"
              label="Nombre (opcional)"
              hideLabel
              placeholder="Nombre (opcional)"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          )}
        />
        <form.Field
          name="email"
          validators={{ onBlur: emailSchema, onSubmit: emailSchema }}
          children={(field) => (
            <Input
              id="signup-email"
              name={field.name}
              type="email"
              autoComplete="email"
              inputMode="email"
              label="Email"
              hideLabel
              placeholder="Email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => {
                setServerError('')
                field.handleChange(e.target.value)
              }}
              error={fieldError(field) ?? (serverError || undefined)}
            />
          )}
        />
        <form.Field
          name="password"
          validators={{ onBlur: newPasswordSchema, onSubmit: newPasswordSchema }}
          children={(field) => (
            <Input
              id="signup-password"
              name={field.name}
              type="password"
              autoComplete="new-password"
              label="Contraseña"
              hideLabel
              placeholder="Contraseña (mínimo 8 caracteres)"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field)}
            />
          )}
        />
        <form.Subscribe
          selector={(s) => s.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear cuenta'}
            </Button>
          )}
        />
      </form>
    </AuthLayout>
  )
}
