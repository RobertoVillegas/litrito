import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from './entrar'
import { SignUp } from './registro'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode
    to: string
    className?: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useNavigate: () => mocks.navigate,
}))

vi.mock('#/lib/auth-client', () => ({
  authClient: {
    signIn: { email: mocks.signInEmail },
    signUp: { email: mocks.signUpEmail },
  },
}))

vi.mock('#/lib/analytics', () => ({
  track: vi.fn(),
}))

describe('auth forms', () => {
  beforeEach(() => {
    mocks.navigate.mockReset()
    mocks.signInEmail.mockReset()
    mocks.signUpEmail.mockReset()
  })

  it('does not navigate after a rejected sign up response', async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: null,
      error: { message: 'Unable to create user' },
    })

    render(<SignUp />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña (mínimo 8 caracteres)'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await screen.findByText('No se pudo crear la cuenta. ¿Ya existe ese correo?')
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('does not navigate after a rejected sign in response', async () => {
    mocks.signInEmail.mockResolvedValue({
      data: null,
      error: { message: 'Invalid email or password' },
    })

    render(<SignIn />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await screen.findByText('Correo o contraseña incorrectos.')
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('navigates after a successful sign up response', async () => {
    mocks.signUpEmail.mockResolvedValue({
      data: { user: { id: 'user_1' } },
      error: null,
    })

    render(<SignUp />)

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'new@example.com' },
    })
    fireEvent.change(screen.getByPlaceholderText('Contraseña (mínimo 8 caracteres)'), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: '/perfil' }))
  })
})
