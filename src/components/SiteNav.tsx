import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import Avatar from 'boring-avatars'
import { ChevronDown, Fuel, LogOut, MapPin } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { useUserLocation } from '#/lib/useUserLocation'

const AVATAR_COLORS = ['#e60000', '#25282b', '#7e7e7e', '#bebebe', '#ffffff']

export function SiteNav() {
  return (
    <header className="sticky top-0 z-[1100] border-b border-white/10 bg-ink text-on-dark">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-white hover:text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-brand">
            <Fuel className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-2xl leading-none text-white">Litrito</span>
        </Link>

        <div className="ml-2 hidden items-center gap-1 sm:flex">
          <NavLink to="/" label="Inicio" />
          <NavLink to="/metricas" label="Métricas" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <LocationPill />
          <AccountMenu />
        </div>
      </nav>
    </header>
  )
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-full px-3 py-1.5 text-sm font-bold text-white/60 transition hover:text-white"
      activeProps={{ className: 'rounded-full px-3 py-1.5 text-sm font-bold text-white' }}
      activeOptions={{ exact: to === '/' }}
    >
      {label}
    </Link>
  )
}

function LocationPill() {
  const userLoc = useUserLocation()
  const loc = userLoc.location
  const label = loc?.city ?? (loc ? 'Ubicación' : 'Detectando…')
  const precise = loc?.source === 'precise'
  return (
    <button
      type="button"
      onClick={userLoc.requestPrecise}
      title={precise ? 'Ubicación precisa activa' : 'Usar mi ubicación precisa'}
      className="hidden items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-bold text-white/80 transition hover:border-white/50 hover:text-white md:inline-flex"
    >
      <MapPin className={`h-3.5 w-3.5 ${precise ? 'text-brand' : 'text-white/50'}`} />
      <span className="max-w-[140px] truncate">{label}</span>
    </button>
  )
}

function AccountMenu() {
  const session = authClient.useSession()
  const sessionUser = session?.data?.user ?? null
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/20 py-1 pl-1 pr-2.5 text-sm font-bold text-white transition hover:border-white/50"
      >
        {sessionUser ? (
          <Avatar
            size={26}
            name={sessionUser.email ?? sessionUser.name ?? 'litrito'}
            variant="marble"
            colors={AVATAR_COLORS}
          />
        ) : (
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white/10 text-xs">
            ⛽
          </span>
        )}
        <span className="hidden max-w-[120px] truncate sm:inline">
          {sessionUser ? (sessionUser.name ?? sessionUser.email) : 'Entrar'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-white/50" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[1200]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-[1300] mt-2 w-80 rounded-[6px] border border-line bg-white p-4 text-ink shadow-[0_12px_40px_rgba(37,40,43,0.18)]">
            {sessionUser ? (
              <SignedInPanel
                name={sessionUser.name ?? sessionUser.email ?? ''}
                email={sessionUser.email ?? ''}
              />
            ) : (
              <AuthForm onDone={() => setOpen(false)} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SignedInPanel({ name, email }: { name: string; email: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar size={40} name={email || name} variant="marble" colors={AVATAR_COLORS} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink">{name}</div>
          <div className="truncate text-xs text-body">{email}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void authClient.signOut()}
        className="btn-pill btn-pill--outline-dark w-full text-sm"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesion
      </button>
    </div>
  )
}

function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    try {
      if (mode === 'signin') {
        await authClient.signIn.email({ email, password })
      } else {
        await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0] || 'Litrito',
        })
      }
      setPassword('')
      onDone()
    } catch {
      setMessage('No se pudo completar el acceso. Revisa tus datos.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <div className="eyebrow text-body">
        {mode === 'signin' ? 'Iniciar sesion' : 'Crear cuenta'}
      </div>
      {mode === 'signup' && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (opcional)"
          className="h-10 w-full rounded-[6px] border border-line px-3 text-sm"
        />
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="h-10 w-full rounded-[6px] border border-line px-3 text-sm"
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Contrasena"
        className="h-10 w-full rounded-[6px] border border-line px-3 text-sm"
      />
      <button
        type="submit"
        disabled={submitting}
        className="btn-pill btn-pill--primary w-full text-sm disabled:opacity-50"
      >
        {submitting ? 'Enviando…' : mode === 'signin' ? 'Entrar' : 'Crear cuenta'}
      </button>
      <button
        type="button"
        onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
        className="w-full text-center text-xs font-bold text-brand hover:text-brand-dark"
      >
        {mode === 'signin' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
      </button>
      {message && <p className="text-xs font-semibold text-brand">{message}</p>}
    </form>
  )
}

export default SiteNav
