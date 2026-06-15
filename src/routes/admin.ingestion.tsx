import { createFileRoute } from '@tanstack/react-router'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Check, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Button } from '#/components/ui/button'
import { RouteErrorFallback } from '../components/RouteError'
import { Skeleton } from '../components/Skeleton'

export const Route = createFileRoute('/admin/ingestion')({
  head: () => ({
    meta: [{ title: 'Auditoría de ingesta - Litrito' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AdminIngestion,
  errorComponent: ({ error, reset }) => (
    <RouteErrorFallback
      error={error}
      reset={reset}
      screen="admin-ingestion"
      context={{ route: '/admin/ingestion' }}
    />
  ),
})

type RunStatus = 'running' | 'success' | 'failed' | 'skipped'

type IngestionRun = {
  _id: string
  kind: string
  status: RunStatus
  startedAt: string
  finishedAt?: string
  stateExternalId?: string
  municipalityExternalId?: string
  sourceUrl?: string
  message?: string
  recordsRead?: number
  recordsWritten?: number
}

type StatusSummary = Record<
  string,
  { count: number; recordsRead: number; recordsWritten: number }
>

type AuditEvent = {
  _id: string
  actorEmail?: string
  action: string
  target: string
  createdAt: string
  status: 'success' | 'failed'
  message?: string
  runId?: string
}

type Overview = {
  latestDailyQueue: IngestionRun | null
  municipalitySummary: StatusSummary
  municipalityTotal: number
  municipalityOldestStartedAt: string | null
  municipalityNewestStartedAt: string | null
  recentRuns: IngestionRun[]
  recentFailures: IngestionRun[]
  auditEvents: AuditEvent[]
}

type BrandAuditRow = {
  _id: string
  stationPermitNumber: string
  stationName: string
  stationAddress: string
  stateName?: string
  municipalityName?: string
  candidateName?: string
  candidateBrand?: string
  candidateOperator?: string
  candidateDistanceMeters?: number
  matchStatus:
    | 'accepted'
    | 'review_nearby_not_accepted'
    | 'no_match'
    | 'manual_override'
    | 'rejected'
  acceptedBrand?: string
  confidence: 'high' | 'review' | 'none'
  notes?: string
  reviewedBy?: string
  reviewedAt?: string
  updatedAt: string
}

type BrandAuditOverview = {
  summary: {
    total: number
    accepted: number
    review: number
    manual: number
    rejected: number
    noMatch: number
  }
  rows: BrandAuditRow[]
}

function AdminIngestion() {
  const overview = useQuery(api.admin.ingestionOverview, {}) as Overview | undefined
  const brandAudit = useQuery(api.admin.stationBrandAuditOverview, {
    stateExternalId: '32',
    municipalityExternalId: '056',
  }) as BrandAuditOverview | undefined
  const retryMunicipality = useAction(api.admin.retryMunicipalityPrices)
  const scanBrands = useAction(api.admin.scanStationBrands)
  const reviewBrand = useMutation(api.admin.reviewStationBrand)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [scanningBrands, setScanningBrands] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const retry = async (run: IngestionRun) => {
    if (!run.stateExternalId || !run.municipalityExternalId) return
    setNotice(null)
    setRetrying(String(run._id))
    try {
      const result = await retryMunicipality({
        stateExternalId: run.stateExternalId,
        municipalityExternalId: run.municipalityExternalId,
      })
      setNotice(`Reintento completo: ${result.recordsWritten} cambios escritos.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo reintentar.')
    } finally {
      setRetrying(null)
    }
  }

  const scanZacatecasBrands = async () => {
    setNotice(null)
    setScanningBrands(true)
    try {
      const result = await scanBrands({
        stateExternalId: '32',
        municipalityExternalId: '056',
      })
      setNotice(
        `Auditoría de marcas: ${result.scanned} estaciones, ${result.candidates} candidatos OSM.`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo auditar marcas.')
    } finally {
      setScanningBrands(false)
    }
  }

  const decideBrand = async (
    row: BrandAuditRow,
    decision: 'accept_candidate' | 'reject' | 'manual_override',
  ) => {
    const acceptedBrand =
      decision === 'manual_override'
        ? window.prompt('Marca correcta', row.acceptedBrand || row.stationName)
        : undefined
    if (decision === 'manual_override' && !acceptedBrand?.trim()) return

    const notes =
      decision === 'reject'
        ? window.prompt('Nota de rechazo', row.notes ?? 'Falso positivo') ?? undefined
        : undefined

    await reviewBrand({
      stationPermitNumber: row.stationPermitNumber,
      decision,
      acceptedBrand: acceptedBrand?.trim(),
      notes: notes?.trim(),
    })
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="border-b border-line bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm font-bold text-white/70">
            <ShieldCheck className="h-4 w-4 text-brand" />
            Administración
          </div>
          <h1 className="font-display mt-3 text-5xl text-white sm:text-6xl">
            Auditoría de ingesta
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/70">
            Estado operativo de los crons de precios CNE, runs recientes y reintentos
            manuales.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {overview === undefined ? (
          <AdminSkeleton />
        ) : (
          <div className="space-y-8">
            {notice && (
              <div className="rounded-[6px] border border-line bg-ash px-4 py-3 text-sm font-bold text-ink">
                {notice}
              </div>
            )}

            <OverviewGrid overview={overview} />

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="eyebrow text-body">Auditoría de marcas</h2>
                  <p className="mt-1 text-sm text-mute">
                    Piloto Zacatecas Capital: OSM automático solo hasta 40m; 41-100m queda
                    para revisión.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void scanZacatecasBrands()}
                  disabled={scanningBrands}
                >
                  <Search className="h-4 w-4" />
                  {scanningBrands ? 'Escaneando' : 'Escanear Zacatecas'}
                </Button>
              </div>
              {brandAudit === undefined ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <BrandAuditTable
                  audit={brandAudit}
                  onDecision={(row, decision) => void decideBrand(row, decision)}
                />
              )}
            </section>

            {overview.recentFailures.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-brand" />
                  <h2 className="eyebrow text-body">Fallos recientes</h2>
                </div>
                <div className="overflow-x-auto rounded-[6px] border border-line">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead className="bg-ash text-xs uppercase text-mute">
                      <tr>
                        <Th>Inicio</Th>
                        <Th>Ubicación</Th>
                        <Th>Mensaje</Th>
                        <Th>Acción</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {overview.recentFailures.map((run) => (
                        <tr key={run._id}>
                          <Td>{formatDateTime(run.startedAt)}</Td>
                          <Td>{formatLocation(run)}</Td>
                          <Td>{run.message ?? 'Sin mensaje'}</Td>
                          <Td>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => void retry(run)}
                              disabled={retrying === String(run._id)}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              {retrying === String(run._id) ? 'Reintentando' : 'Reintentar'}
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section>
              <h2 className="eyebrow text-body">Runs municipales recientes</h2>
              <RunsTable runs={overview.recentRuns} />
            </section>

            <section>
              <h2 className="eyebrow text-body">Eventos admin</h2>
              <div className="mt-3 overflow-x-auto rounded-[6px] border border-line">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-ash text-xs uppercase text-mute">
                    <tr>
                      <Th>Fecha</Th>
                      <Th>Actor</Th>
                      <Th>Acción</Th>
                      <Th>Target</Th>
                      <Th>Estado</Th>
                      <Th>Mensaje</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {overview.auditEvents.length === 0 ? (
                      <tr>
                        <Td colSpan={6}>Aún no hay eventos manuales.</Td>
                      </tr>
                    ) : (
                      overview.auditEvents.map((event) => (
                        <tr key={event._id}>
                          <Td>{formatDateTime(event.createdAt)}</Td>
                          <Td>{event.actorEmail ?? 'internal'}</Td>
                          <Td>{event.action}</Td>
                          <Td>{event.target}</Td>
                          <Td>
                            <StatusBadge status={event.status} />
                          </Td>
                          <Td>{event.message ?? '—'}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

function OverviewGrid({ overview }: { overview: Overview }) {
  const summary = overview.municipalitySummary
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MetricCard
        label="Última carga nacional"
        value={overview.latestDailyQueue ? formatDateTime(overview.latestDailyQueue.startedAt) : '—'}
        detail={overview.latestDailyQueue?.message ?? 'Sin carga registrada'}
      />
      <MetricCard
        label="Municipios procesados"
        value={overview.municipalityTotal.toLocaleString('es-MX')}
        detail={`${overview.municipalityOldestStartedAt ? formatTime(overview.municipalityOldestStartedAt) : '—'} - ${overview.municipalityNewestStartedAt ? formatTime(overview.municipalityNewestStartedAt) : '—'}`}
      />
      <MetricCard
        label="Success / skipped / failed"
        value={`${summary.success?.count ?? 0} / ${summary.skipped?.count ?? 0} / ${summary.failed?.count ?? 0}`}
        detail="Resumen posterior al último daily_queue"
      />
      <MetricCard
        label="Precios leídos / cambios"
        value={`${(summary.success?.recordsRead ?? 0).toLocaleString('es-MX')} / ${(summary.success?.recordsWritten ?? 0).toLocaleString('es-MX')}`}
        detail="Solo runs exitosos"
      />
    </div>
  )
}

function RunsTable({ runs }: { runs: IngestionRun[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-[6px] border border-line">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-ash text-xs uppercase text-mute">
          <tr>
            <Th>Inicio</Th>
            <Th>Estado</Th>
            <Th>Ubicación</Th>
            <Th>Leídos</Th>
            <Th>Cambios</Th>
            <Th>Mensaje</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {runs.map((run) => (
            <tr key={run._id}>
              <Td>{formatDateTime(run.startedAt)}</Td>
              <Td>
                <StatusBadge status={run.status} />
              </Td>
              <Td>{formatLocation(run)}</Td>
              <Td>{run.recordsRead ?? 0}</Td>
              <Td>{run.recordsWritten ?? 0}</Td>
              <Td>{run.message ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BrandAuditTable({
  audit,
  onDecision,
}: {
  audit: BrandAuditOverview
  onDecision: (
    row: BrandAuditRow,
    decision: 'accept_candidate' | 'reject' | 'manual_override',
  ) => void
}) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-line">
      <div className="grid gap-3 border-b border-line bg-ash p-4 text-sm sm:grid-cols-6">
        <MiniMetric label="Total" value={audit.summary.total} />
        <MiniMetric label="Aceptadas" value={audit.summary.accepted} />
        <MiniMetric label="Revisión" value={audit.summary.review} />
        <MiniMetric label="Manual" value={audit.summary.manual} />
        <MiniMetric label="Rechazadas" value={audit.summary.rejected} />
        <MiniMetric label="Sin match" value={audit.summary.noMatch} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-white text-xs uppercase text-mute">
            <tr>
              <Th>Estación CNE</Th>
              <Th>Candidato</Th>
              <Th>Distancia</Th>
              <Th>Estado</Th>
              <Th>Marca aceptada</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {audit.rows.length === 0 ? (
              <tr>
                <Td colSpan={6}>Aún no hay auditoría. Ejecuta el escaneo piloto.</Td>
              </tr>
            ) : (
              audit.rows.map((row) => (
                <tr key={row._id}>
                  <Td>
                    <div className="font-bold text-ink">{row.stationName}</div>
                    <div className="mt-1 text-xs text-mute">{row.stationPermitNumber}</div>
                    <div className="mt-1 max-w-[340px] text-xs text-body">
                      {row.stationAddress}
                    </div>
                  </Td>
                  <Td>
                    <div className="font-bold text-ink">
                      {row.candidateBrand || row.candidateName || '—'}
                    </div>
                    {row.candidateOperator && (
                      <div className="mt-1 text-xs text-mute">{row.candidateOperator}</div>
                    )}
                    {row.notes && <div className="mt-1 text-xs text-brand">{row.notes}</div>}
                  </Td>
                  <Td>
                    {typeof row.candidateDistanceMeters === 'number'
                      ? `${row.candidateDistanceMeters}m`
                      : '—'}
                  </Td>
                  <Td>
                    <BrandStatusBadge status={row.matchStatus} />
                  </Td>
                  <Td>
                    <div className="font-bold text-ink">{row.acceptedBrand ?? '—'}</div>
                    {row.reviewedBy && (
                      <div className="mt-1 text-xs text-mute">
                        {row.reviewedBy} ·{' '}
                        {row.reviewedAt ? formatDateTime(row.reviewedAt) : '—'}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onDecision(row, 'accept_candidate')}
                        disabled={!row.candidateBrand && !row.candidateName}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Aceptar
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onDecision(row, 'manual_override')}
                      >
                        Manual
                      </Button>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onDecision(row, 'reject')}
                      >
                        <X className="h-3.5 w-3.5" />
                        Rechazar
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-xs font-black uppercase text-mute">{label}</div>
      <div className="mt-1 text-xl font-black text-ink">{value}</div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-[6px] border border-line p-4">
      <div className="text-xs font-black uppercase text-mute">{label}</div>
      <div className="mt-2 text-2xl font-black text-ink">{value}</div>
      <div className="mt-2 text-xs leading-5 text-body">{detail}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: RunStatus }) {
  const cls =
    status === 'success'
      ? 'bg-green-50 text-green-700'
      : status === 'failed'
        ? 'bg-red-50 text-red-700'
        : status === 'skipped'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-blue-50 text-blue-700'
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${cls}`}>
      {status}
    </span>
  )
}

function BrandStatusBadge({ status }: { status: BrandAuditRow['matchStatus'] }) {
  const cls =
    status === 'accepted' || status === 'manual_override'
      ? 'bg-green-50 text-green-700'
      : status === 'review_nearby_not_accepted'
        ? 'bg-amber-50 text-amber-700'
        : status === 'rejected'
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-black ${cls}`}>
      {status}
    </span>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-black">{children}</th>
}

function Td({
  children,
  colSpan,
}: {
  children: ReactNode
  colSpan?: number
}) {
  return (
    <td colSpan={colSpan} className="px-4 py-3 align-top text-body">
      {children}
    </td>
  )
}

function AdminSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-[6px] border border-line p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </div>
  )
}

function formatLocation(run: IngestionRun) {
  if (!run.stateExternalId && !run.municipalityExternalId) return '—'
  return `${run.stateExternalId ?? '—'} / ${run.municipalityExternalId ?? '—'}`
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso))
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso))
}
