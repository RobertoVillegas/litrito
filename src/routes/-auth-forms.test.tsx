import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from '../components/SignIn'
import { SignUp } from '../components/SignUp'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  signInEmail: vi.fn(),
  signUpEmail: vi.fn(),
  signInSocial: vi.fn(),
  isGoogleEnabled: false as boolean | undefined,
}))

// GoogleSignInButton reads its visibility from a Convex query; stub it so the
// forms render without a ConvexProvider.
vi.mock('convex/react', () => ({
  useQuery: () => mocks.isGoogleEnabled,
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
    signIn: { email: mocks.signInEmail, social: mocks.signInSocial },
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
    mocks.signInSocial.mockReset()
    mocks.isGoogleEnabled = false
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

  it('hides the Google button when the provider is disabled', () => {
    mocks.isGoogleEnabled = false
    render(<SignIn />)
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull()
  })

  it('starts the Google social flow when enabled', () => {
    mocks.isGoogleEnabled = true
    mocks.signInSocial.mockResolvedValue({ data: null, error: null })

    render(<SignIn />)

    fireEvent.click(screen.getByRole('button', { name: /Google/ }))

    expect(mocks.signInSocial).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: '/perfil',
    })
  })
})
