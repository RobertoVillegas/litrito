import { cn } from '../lib/utils'

type Props = {
  className?: string
}

export function SiteFooter({ className }: Props) {
  return (
    <footer className={cn('bg-ink text-on-dark', className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-10 sm:px-6 lg:px-8">
        <div>
          <div className="font-display text-3xl text-white">Litrito</div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
            Precios informativos reportados por permisionarios a la Comisión
            Nacional de Energía. Pueden cambiar en estación.
          </p>
        </div>
        <div className="space-y-2 md:hidden">
          <p className="eyebrow text-white/40">Hecho en México</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-bold uppercase tracking-widest">
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
              Hecho por athas
            </a>
          </div>
        </div>
        <div className="hidden md:flex md:items-center md:justify-between">
          <p className="eyebrow text-white/40">
            Hecho en México ·{' '}
            <a
              href="https://www.cne.gob.mx/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 underline decoration-white/20 underline-offset-2 hover:text-brand"
            >
              Fuente CNE
            </a>
          </p>
          <a
            href="https://athas.mx"
            target="_blank"
            rel="noopener noreferrer"
            className="eyebrow text-white/40 hover:text-brand"
          >
            Hecho por athas
          </a>
        </div>
      </div>
    </footer>
  )
}
