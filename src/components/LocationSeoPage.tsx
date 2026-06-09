import { ArrowRight, BarChart3, Fuel, MapPin } from 'lucide-react'
import { SiteFooter } from './SiteFooter'

type FuelType = 'regular' | 'premium' | 'diesel' | 'duba' | 'unknown'

type FuelMetric = {
  fuelType: FuelType
  average: number | null
  min: number | null
  max: number | null
  count: number
}

type LocationOverview = {
  state: { externalId: string; name: string; slug: string }
  municipality: { externalId: string; name: string; slug: string } | null
  metrics: FuelMetric[]
  stationCount: number
  topRegular: {
    station: {
      permitNumber: string
      name: string
      address: string
      municipalityName?: string
      stateName?: string
    }
    price: number
    reportedAt?: string
  }[]
  states: { externalId: string; name: string; slug: string; count: number }[]
  municipalities: {
    externalId: string
    stateExternalId: string
    name: string
    slug: string
    count: number
  }[]
}

const fuelLabels: Record<FuelType, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diésel',
  duba: 'DUBA',
  unknown: 'Otro',
}

function formatCurrency(value: number | null): string {
  if (value == null) return 'Sin datos'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-MX').format(value)
}

export function LocationSeoPage({ data }: { data: LocationOverview }) {
  const placeName = data.municipality
    ? `${data.municipality.name}, ${data.state.name}`
    : data.state.name
  const regularMetric = data.metrics.find((m) => m.fuelType === 'regular')
  const exploreSearch = data.municipality
    ? `?state=${data.state.externalId}&municipality=${data.state.externalId}:${data.municipality.externalId}&fuels=regular&primary=regular&sort=price`
    : `?state=${data.state.externalId}&fuels=regular&primary=regular&sort=price`

  return (
    <main className="min-h-screen bg-white">
      <section className="bg-ink text-on-dark">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.65fr)] lg:px-8">
          <div>
            <div className="eyebrow inline-flex items-center gap-2 rounded-[32px] bg-brand px-3 py-1.5 text-white">
              <MapPin className="h-4 w-4" />
              Precios por ubicación
            </div>
            <h1 className="font-display mt-5 text-4xl leading-none text-white sm:text-6xl">
              Gasolina en {placeName}
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-light leading-8 text-white/70">
              Consulta promedios, rangos y estaciones con mejor precio reportado
              para tomar una decisión antes de cargar combustible.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`/explorar${exploreSearch}`}
                className="btn-pill btn-pill--primary"
              >
                Ver estaciones
                <ArrowRight className="h-4 w-4" />
              </a>
              {data.municipality && (
                <a
                  href={`/estado/${data.state.slug}`}
                  className="btn-pill border border-white/35 text-white hover:bg-white/10"
                >
                  Todo {data.state.name}
                </a>
              )}
            </div>
          </div>

          <div className="rounded-[6px] border border-white/15 bg-white/[0.04] p-5">
            <div className="eyebrow text-white/45">Promedio regular</div>
            <div className="mt-3 text-5xl font-black text-white">
              {formatCurrency(regularMetric?.average ?? null)}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <MetricPill label="Estaciones" value={formatNumber(data.stationCount)} />
              <MetricPill
                label="Reportes"
                value={formatNumber(regularMetric?.count ?? 0)}
              />
              <MetricPill label="Mínimo" value={formatCurrency(regularMetric?.min ?? null)} />
              <MetricPill label="Máximo" value={formatCurrency(regularMetric?.max ?? null)} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand" />
          <h2 className="font-display text-2xl text-ink">Métricas por combustible</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {data.metrics.map((metric) => (
            <article
              key={metric.fuelType}
              className="rounded-[6px] border border-line bg-white p-4"
            >
              <div className="flex items-center gap-2 text-sm font-black text-ink">
                <Fuel className="h-4 w-4 text-brand" />
                {fuelLabels[metric.fuelType]}
              </div>
              <div className="mt-3 text-2xl font-black text-ink">
                {formatCurrency(metric.average)}
              </div>
              <div className="mt-3 space-y-1 text-xs font-bold text-body">
                <div>Mínimo: {formatCurrency(metric.min)}</div>
                <div>Máximo: {formatCurrency(metric.max)}</div>
                <div>Reportes: {formatNumber(metric.count)}</div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl text-ink">
              Regular más barata en {placeName}
            </h2>
            <p className="mt-1 text-sm font-semibold text-body">
              Ranking basado en precios vigentes reportados por estación.
            </p>
          </div>
          <a
            href={`/explorar${exploreSearch}`}
            className="hidden rounded-full border border-line px-4 py-2 text-xs font-bold text-ink transition hover:border-ink sm:inline-flex"
          >
            Explorar más
          </a>
        </div>
        {data.topRegular.length === 0 ? (
          <div className="rounded-[6px] border border-line p-5 text-sm font-semibold text-body">
            No hay precios de regular vigentes para esta ubicación.
          </div>
        ) : (
          <div className="grid gap-2">
            {data.topRegular.map((row, index) => (
              <a
                key={row.station.permitNumber}
                href={`/estacion/${encodeURIComponent(row.station.permitNumber)}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[6px] border border-line p-3 transition hover:border-ink"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-black text-white">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-ink">
                    {row.station.name}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-semibold text-body">
                    {[row.station.municipalityName, row.station.stateName]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                </div>
                <div className="text-right text-base font-black text-ink">
                  {formatCurrency(row.price)}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <nav aria-label="Municipios del estado">
          <h2 className="font-display text-2xl text-ink">Municipios de {data.state.name}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.municipalities.map((municipality) => (
              <a
                key={municipality.externalId}
                href={`/estado/${data.state.slug}/${municipality.slug}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  data.municipality?.externalId === municipality.externalId
                    ? 'border-ink bg-ink text-white'
                    : 'border-line text-ink hover:border-ink'
                }`}
              >
                {municipality.name} · {formatNumber(municipality.count)}
              </a>
            ))}
          </div>
        </nav>

        <nav aria-label="Estados de México">
          <h2 className="font-display text-2xl text-ink">Otros estados</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.states.map((state) => (
              <a
                key={state.externalId}
                href={`/estado/${state.slug}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  state.externalId === data.state.externalId && !data.municipality
                    ? 'border-brand bg-brand text-white'
                    : 'border-line text-ink hover:border-ink'
                }`}
              >
                {state.name}
              </a>
            ))}
          </div>
        </nav>
      </section>

      <SiteFooter />
    </main>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[10px] font-black uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="mt-1 font-black text-white">{value}</div>
    </div>
  )
}
