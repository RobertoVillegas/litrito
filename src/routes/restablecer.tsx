import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { authClient } from '#/lib/auth-client'
import { fieldError, newPasswordSchema } from '#/lib/forms'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { useToast } from '#/components/ui/toast'
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
  const toast = useToast()
  const [serverError, setServerError] = useState('')
  const [done, setDone] = useState(false)

  const form = useForm({
    defaultValues: { password: '' },
    onSubmit: async ({ value }) => {
      setServerError('')
      try {
        const client = authClient as unknown as Resetter
        const result = await client.resetPassword?.({ newPassword: value.password, token })
        if (result?.error) throw new Error(result.error.message ?? 'Password reset failed')
        setDone(true)
        toast.add({ title: 'Contraseña actualizada', type: 'success' })
        setTimeout(() => navigate({ to: '/entrar' }), 1500)
      } catch {
        setServerError('El enlace es inválido o expiró. Solicita uno nuevo.')
      }
    },
  })

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
            name="password"
            validators={{ onBlur: newPasswordSchema, onSubmit: newPasswordSchema }}
            children={(field) => (
              <Input
                id="reset-password"
                name={field.name}
                type="password"
                autoComplete="new-password"
                label="Nueva contraseña"
                hideLabel
                placeholder="Nueva contraseña (mínimo 8)"
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
                {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
              </Button>
            )}
          />
          {serverError && (
            <p role="alert" className="text-sm font-semibold text-brand">
              {serverError}
            </p>
          )}
        </form>
      )}
    </AuthLayout>
  )
}
