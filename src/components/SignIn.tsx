import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { authClient } from '#/lib/auth-client'
import { track } from '#/lib/analytics'
import { emailSchema, fieldError, passwordSchema } from '#/lib/forms'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { AuthLayout } from './AuthLayout'

type AuthResult = {
  error?: { message?: string } | null
}

export function SignIn() {
  const navigate = useNavigate()
  // Server-side credential failure: form-level (we can't know which field is
  // wrong), shown inline on the fields — not a toast.
  const [serverError, setServerError] = useState('')

  const form = useForm({
    defaultValues: { email: '', password: '' },
    onSubmit: async ({ value }) => {
      setServerError('')
      try {
        const result = (await authClient.signIn.email(value)) as AuthResult
        if (result.error) throw new Error(result.error.message ?? 'Sign in failed')
        track('login')
        navigate({ to: '/perfil' })
      } catch {
        setServerError('Correo o contraseña incorrectos.')
      }
    },
  })

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Accede para sincronizar tus gasolineras favoritas."
      footer={
        <div className="space-y-5">
          <Button render={<Link to="/recuperar" />} variant="ghost" fullWidth>
            ¿Olvidaste tu contraseña?
          </Button>
          <div className="border-t border-line pt-5 text-center">
            <p>¿No tienes cuenta?</p>
            <Button render={<Link to="/registro" />} variant="outline" fullWidth className="mt-3">
              Crear cuenta
            </Button>
          </div>
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
          name="email"
          validators={{ onBlur: emailSchema, onSubmit: emailSchema }}
          children={(field) => (
            <Input
              id="signin-email"
              name={field.name}
              type="email"
              autoComplete="username"
              inputMode="email"
              label="Email"
              hideLabel
              placeholder="Email"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field)}
              invalid={Boolean(serverError)}
            />
          )}
        />
        <form.Field
          name="password"
          validators={{ onBlur: passwordSchema, onSubmit: passwordSchema }}
          children={(field) => (
            <Input
              id="signin-password"
              name={field.name}
              type="password"
              autoComplete="current-password"
              label="Contraseña"
              hideLabel
              placeholder="Contraseña"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              error={fieldError(field) ?? (serverError || undefined)}
            />
          )}
        />
        <form.Subscribe
          selector={(s) => s.isSubmitting}
          children={(isSubmitting) => (
            <Button type="submit" fullWidth disabled={isSubmitting}>
              {isSubmitting ? 'Entrando…' : 'Entrar'}
            </Button>
          )}
        />
      </form>
    </AuthLayout>
  )
}
