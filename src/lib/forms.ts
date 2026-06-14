import type { AnyFieldApi } from '@tanstack/react-form'
import { z } from 'zod'

// Shared Zod field schemas for the auth forms.
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa tu correo')
  .email('Correo inválido')

export const passwordSchema = z.string().min(1, 'Ingresa tu contraseña')

export const newPasswordSchema = z.string().min(8, 'Mínimo 8 caracteres')

// First validation message for a field, but only once the user has interacted
// with it (so untouched fields don't show errors on first render).
export function fieldError(field: AnyFieldApi): string | undefined {
  if (!field.state.meta.isTouched) return undefined
  const first = field.state.meta.errors[0]
  if (!first) return undefined
  return typeof first === 'string' ? first : (first.message as string)
}
