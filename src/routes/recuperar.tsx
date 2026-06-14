import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { authClient } from '#/lib/auth-client'
import { emailSchema, fieldError } from '#/lib/forms'
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
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      try {
        const client = authClient as unknown as ResetRequester
        const request = client.requestPasswordReset ?? client.forgetPassword
        await request?.({
          email: value.email,
          redirectTo: `${window.location.origin}/restablecer`,
        })
      } catch {
        // Ignore — we always show the same message to avoid leaking which
        // emails are registered.
      } finally {
        setEmail(value.email)
        setSent(true)
      }
    },
  })

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
                id="recover-email"
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
              />
            )}
          />
          <form.Subscribe
            selector={(s) => s.isSubmitting}
            children={(isSubmitting) => (
              <Button type="submit" fullWidth disabled={isSubmitting}>
                {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
              </Button>
            )}
          />
        </form>
      )}
    </AuthLayout>
  )
}
