import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Database,
  Mail,
  MapPin,
  MessageCircle,
  RefreshCw,
} from 'lucide-react'
import { SiteFooter } from '../components/SiteFooter'
import { buildSeoMeta } from '../lib/seo'
import { getConfiguredSiteOrigin } from '../lib/site-url'

const ATHAS_URL = 'https://athas.mx?ref=litrito'
const ATHAS_CAL = 'https://cal.com/athasmx/30min'
const ATHAS_MAIL = 'mailto:hola@athas.mx'
const ATHAS_WA = 'https://wa.me/524461428096'

export const Route = createFileRoute('/acerca')({
  head: () => {
    const title = 'Acerca de Litrito - Un proyecto de Athas'
    const description =
      'Litrito compara precios de gasolina en México con datos públicos de la Comisión Nacional de Energía. Construido por Athas, estudio de producto digital.'
    const origin = getConfiguredSiteOrigin()
    const url = origin ? `${origin}/acerca` : undefined
    return {
      meta: buildSeoMeta({
        title,
        description,
        image: {
          title: 'Acerca de Litrito.',
          subtitle: 'Precios de gasolina con datos abiertos.\nUn proyecto de Athas.',
        },
        url,
      }),
      ...(url ? { links: [{ rel: 'canonical', href: url }] } : {}),
    }
  },
  component: AboutPage,
})

const FEATURES = [
  {
    icon: Database,
    title: 'Datos oficiales',
    body: 'Precios reportados por permisionarios a la Comisión Nacional de Energía (CNE), no estimaciones.',
  },
  {
    icon: RefreshCw,
    title: 'Actualizado a diario',
    body: 'Procesamos los reportes cada día para que compares con la información más reciente disponible.',
  },
  {
    icon: MapPin,
    title: 'Por todo México',
    body: 'Filtra por estación, municipio y estado. Regular, premium, diésel y duba en un solo lugar.',
  },
]

function AboutPage() {
  return (
    <main className="min-h-screen">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white/60 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al listado
            </Link>
            <div className="eyebrow inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
              Acerca de
            </div>
          </div>
          <h1 className="font-display mt-4 text-6xl text-white sm:text-7xl">Litrito</h1>
          <p className="mt-4 max-w-2xl text-lg font-light leading-8 text-white/70">
            Comparar el precio de la gasolina en México debería ser fácil. Litrito
            reúne los precios que los permisionarios reportan a la CNE y los hace
            consultables por estación, municipio y estado, actualizados a diario.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="font-display text-4xl text-ink">¿Qué es Litrito?</h2>
        <p className="mt-3 max-w-2xl text-base leading-7 text-body">
          Una herramienta gratuita para encontrar dónde cargar más barato. Los
          precios son informativos y pueden cambiar en estación, pero te dan una
          referencia clara antes de llenar el tanque.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-[10px] border border-line bg-white p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-body">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-ink text-on-dark">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div>
              <h2 className="font-display text-4xl text-white sm:text-5xl">
                Litrito es un proyecto de Athas
              </h2>
              <p className="mt-5 text-lg font-light leading-8 text-white/70">
                Athas es un estudio de diseño y tecnología. Diseñamos y
                construimos lo que tu negocio necesita para operar: desde una
                landing hasta sistemas completos, con integración de IA.
              </p>
              <p className="mt-4 text-lg font-light leading-8 text-white/70">
                Litrito es una muestra de lo que hacemos: datos públicos
                convertidos en una herramienta rápida y útil.
              </p>
            </div>

            <div className="rounded-[14px] border border-white/15 bg-white/[0.04] p-6 sm:p-8">
              <h3 className="text-xl font-bold text-white">¿Tienes un proyecto?</h3>
              <p className="mt-1.5 text-sm leading-6 text-white/60">
                Cuéntanos qué necesitas. Lo diseñamos, lo construimos y lo
                dejamos operando.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <a
                  href={ATHAS_CAL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand/90"
                >
                  <CalendarClock className="h-4 w-4" />
                  Agenda 30 minutos
                </a>
                <a
                  href={ATHAS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm font-bold text-white/80 transition hover:border-white/50 hover:text-white"
                >
                  Conoce Athas
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-5 flex items-center justify-between gap-3">
                <a
                  href={ATHAS_MAIL}
                  className="inline-flex items-center gap-2 text-sm font-bold text-white/55 transition hover:text-brand"
                >
                  <Mail className="h-4 w-4" />
                  hola@athas.mx
                </a>
                <a
                  href={ATHAS_WA}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-white/55 transition hover:text-brand"
                >
                  <MessageCircle className="h-4 w-4" />
                  446 142 8096
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  )
}
