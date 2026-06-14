import { Link } from '@tanstack/react-router'
import { cn } from '../lib/utils'

type Props = {
  className?: string
}

export function SiteFooter({ className }: Props) {
  return (
    <footer className={cn('bg-ink text-on-dark', className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <img
              src="/litrito-logo.webp"
              alt=""
              className="h-10 w-10 object-contain"
              width={40}
              height={40}
            />
            <div className="font-display text-3xl text-white">Litrito</div>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
            Precios informativos reportados por permisionarios a la Comisión
            Nacional de Energía. Pueden cambiar en estación.
          </p>
        </div>
        <div className="md:hidden">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-xs font-bold uppercase tracking-widest">
            <Link
              to="/acerca"
              className="text-white/55 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Acerca
            </Link>
            <span className="text-white/20">·</span>
            <a
              href="https://www.cne.gob.mx/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/55 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Fuente CNE
            </a>
            <span className="text-white/20">·</span>
            <a
              href="https://athas.mx"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/55 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Hecho por Athas
            </a>
          </div>
        </div>
        <div className="hidden md:flex md:items-center md:justify-between">
          <p className="eyebrow text-white/40">
            <a
              href="https://www.cne.gob.mx/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Fuente CNE
            </a>{' '}
            ·{' '}
            <Link
              to="/acerca"
              className="text-white/60 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Acerca
            </Link>
          </p>
          <a
            href="https://athas.mx"
            target="_blank"
            rel="noopener noreferrer"
            className="eyebrow text-white/40 hover:text-brand"
          >
            Hecho por Athas
          </a>
        </div>
      </div>
    </footer>
  )
}
