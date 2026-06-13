import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import Avatar from 'boring-avatars'
import { useQuery } from 'convex/react'
import { ChevronDown, Fuel, LogOut, MapPin, Menu, User, X } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { authClient } from '#/lib/auth-client'
import { useUserLocation } from '#/lib/useUserLocation'

const AVATAR_COLORS = ['#e60000', '#25282b', '#7e7e7e', '#bebebe', '#ffffff']

export function SiteNav() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-[1100] border-b border-white/10 bg-ink text-on-dark">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5 text-white hover:text-white">
          <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-brand">
            <Fuel className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-2xl leading-none text-white">Litrito</span>
        </Link>

        <div className="ml-2 hidden items-center gap-1 sm:flex">
          <NavLink to="/" label="Inicio" />
          <NavLink to="/explorar" label="Explorar" />
          <NavLink to="/metricas" label="Métricas" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <LocationPill />
          <button
            type="button"
            aria-label={mobileOpen ? 'Cerrar navegación' : 'Abrir navegación'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((value) => !value)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:border-white/50 hover:text-white sm:hidden"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <AccountMenu />
        </div>
      </nav>
      {mobileOpen && (
        <div className="border-t border-white/10 bg-ink px-4 py-3 shadow-[0_12px_30px_rgba(0,0,0,0.22)] sm:hidden">
          <div className="mx-auto grid w-full max-w-6xl gap-2">
            <MobileNavLink to="/" label="Inicio" onNavigate={() => setMobileOpen(false)} />
            <MobileNavLink
              to="/explorar"
              label="Explorar"
              onNavigate={() => setMobileOpen(false)}
            />
            <MobileNavLink
              to="/metricas"
              label="Métricas"
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}
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

function MobileNavLink({
  to,
  label,
  onNavigate,
}: {
  to: string
  label: string
  onNavigate: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onNavigate}
      className="rounded-[6px] px-3 py-2.5 text-sm font-bold text-white/70 transition hover:bg-white/[0.06] hover:text-white"
      activeProps={{ className: 'rounded-[6px] bg-white/[0.08] px-3 py-2.5 text-sm font-bold text-white' }}
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
  const admin = useQuery(api.admin.me, sessionUser ? {} : 'skip')
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
                isAdmin={admin?.isAdmin === true}
                onNavigate={() => setOpen(false)}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-body">
                  Entra para sincronizar tus favoritas.
                </p>
                <Link
                  to="/entrar"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-pill--primary w-full text-sm"
                >
                  Entrar
                </Link>
                <Link
                  to="/registro"
                  onClick={() => setOpen(false)}
                  className="btn-pill btn-pill--outline-dark w-full text-sm"
                >
                  Crear cuenta
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function SignedInPanel({
  name,
  email,
  isAdmin,
  onNavigate,
}: {
  name: string
  email: string
  isAdmin: boolean
  onNavigate: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar size={40} name={email || name} variant="marble" colors={AVATAR_COLORS} />
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-ink">{name}</div>
          <div className="truncate text-xs text-body">{email}</div>
        </div>
      </div>
      <Link
        to="/perfil"
        onClick={onNavigate}
        className="btn-pill btn-pill--outline-dark w-full text-sm"
      >
        <User className="h-4 w-4" />
        Mi perfil
      </Link>
      {isAdmin && (
        <Link
          to="/admin/ingestion"
          onClick={onNavigate}
          className="btn-pill btn-pill--outline-dark w-full text-sm"
        >
          Auditoria
        </Link>
      )}
      <button
        type="button"
        onClick={() => void authClient.signOut()}
        className="btn-pill btn-pill--outline-red w-full text-sm"
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesion
      </button>
    </div>
  )
}

export default SiteNav
