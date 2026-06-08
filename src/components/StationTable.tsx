import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDownUp, Loader2, Star } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { cn } from '../lib/utils'
import type { FuelType, SortMode } from './StationFilters'

type Station = {
  permitNumber: string
  name: string
  address: string
  municipalityName?: string
  stateName?: string
  latitude?: number
  longitude?: number
}

export type StationRow = {
  station: Station
  prices: Partial<Record<FuelType, { price: number }>>
  highlightedPrice: number | null
  distanceKm?: number | null
}

type Props = {
  rows: StationRow[]
  fuelTypes: FuelType[]
  sortMode: SortMode
  isLoading: boolean
  canLoadMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onSortModeChange?: (sortMode: SortMode) => void
  onFuelSortChange?: (fuelType: FuelType) => void
  onToggleFavorite?: (permitNumber: string) => void
  favoriteSet?: Set<string>
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`
  if (km < 10) return `${km.toFixed(1)} km`
  return `${Math.round(km)} km`
}

const FUEL_LABEL: Record<FuelType, string> = {
  regular: 'Regular',
  premium: 'Premium',
  diesel: 'Diésel',
  duba: 'Diésel S',
}

function useIsMobile(query = '(max-width: 639px)') {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setIsMobile(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return isMobile
}

function StationCard({
  row,
  fuelTypes,
  sortMode,
  onToggleFavorite,
  isFavorite,
  distanceKm,
}: {
  row: StationRow
  fuelTypes: FuelType[]
  sortMode: SortMode
  onToggleFavorite?: (permitNumber: string) => void
  isFavorite: boolean
  distanceKm?: number
}) {
  const s = row.station
  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/estacion/$"
          params={{ _splat: s.permitNumber }}
          className="min-w-0 flex-1 truncate text-sm font-black text-ink hover:text-brand"
        >
          {s.name}
        </Link>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(s.permitNumber)}
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition',
              isFavorite
                ? 'border-brand bg-[#fff0f0] text-brand'
                : 'border-slate-200 bg-white text-slate-400',
            )}
            title="Favorita"
          >
            <Star className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      <div className="mt-0.5 truncate text-xs text-body">{s.address}</div>
      <div className="truncate text-[11px] text-mute">
        {[s.municipalityName, s.stateName].filter(Boolean).join(', ')}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {fuelTypes.map((ft) => {
          const price = row.prices[ft]?.price
          return (
            <span
              key={ft}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
                price != null
                  ? 'border-line bg-canvas-soft text-ink'
                  : 'border-slate-100 bg-white text-mute',
              )}
            >
              <span className="text-[10px] uppercase tracking-wide text-body">
                {FUEL_LABEL[ft]}
              </span>
              {price != null ? formatCurrency(price) : '–'}
            </span>
          )
        })}
      </div>
      {sortMode === 'distance' && distanceKm != null && (
        <div className="mt-2 text-xs font-bold text-brand">
          A {formatDistance(distanceKm)}
        </div>
      )}
    </div>
  )
}

export function StationTable({
  rows,
  fuelTypes,
  sortMode,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
  onSortModeChange,
  onFuelSortChange,
  onToggleFavorite,
  favoriteSet,
}: Props) {
  const columns = useMemo<ColumnDef<StationRow>[]>(() => {
    const SortHeader = ({
      children,
      active,
      onClick,
      align = 'left',
    }: {
      children: ReactNode
      active: boolean
      onClick: () => void
      align?: 'left' | 'right'
    }) => (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex w-full items-center gap-1.5 transition hover:text-ink',
          align === 'right' ? 'justify-end' : 'justify-start',
          active ? 'text-ink' : 'text-slate-500',
        )}
      >
        <span>{children}</span>
        <ArrowDownUp
          className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-35')}
        />
      </button>
    )

    const cols: ColumnDef<StationRow>[] = [
      {
        id: 'name',
        header: () => (
          <SortHeader
            active={sortMode === 'name'}
            onClick={() => onSortModeChange?.('name')}
          >
            Estación
          </SortHeader>
        ),
        cell: ({ row }) => {
          const s = row.original.station
          return (
            <div className="flex min-w-0 items-center gap-2">
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={() => onToggleFavorite(s.permitNumber)}
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border transition',
                    favoriteSet?.has(s.permitNumber)
                      ? 'border-brand bg-[#fff0f0] text-brand'
                      : 'border-slate-200 bg-white text-slate-400 hover:text-brand',
                  )}
                  title="Favorita"
                >
                  <Star
                    className="h-3.5 w-3.5"
                    fill={favoriteSet?.has(s.permitNumber) ? 'currentColor' : 'none'}
                  />
                </button>
              )}
              <div className="min-w-0">
                <Link
                  to="/estacion/$"
                  params={{ _splat: s.permitNumber }}
                  className="block truncate text-sm font-black text-ink hover:text-brand"
                >
                  {s.name}
                </Link>
                <div className="text-[10px] font-semibold text-body">
                  {s.permitNumber}
                </div>
              </div>
            </div>
          )
        },
        size: 280,
      },
      {
        id: 'location',
        header: () => <span>Ubicación</span>,
        cell: ({ row }) => {
          const s = row.original.station
          return (
            <div className="min-w-0">
              <div className="truncate text-xs text-slate-700">{s.address}</div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {[s.municipalityName, s.stateName].filter(Boolean).join(', ')}
              </div>
            </div>
          )
        },
        size: 220,
      },
      ...fuelTypes.map<ColumnDef<StationRow>>((ft) => ({
        id: `fuel-${ft}`,
        header: () => (
          <SortHeader
            active={sortMode === 'price' && ft === fuelTypes[0]}
            onClick={() => onFuelSortChange?.(ft)}
            align="right"
          >
            <span className="uppercase">{ft}</span>
          </SortHeader>
        ),
        cell: ({ row }) => {
          const price = row.original.prices[ft]?.price
          return (
            <div
              className={cn(
                'text-right text-sm font-bold',
                price != null ? 'text-slate-950' : 'text-slate-300',
              )}
            >
              {price != null ? formatCurrency(price) : '–'}
            </div>
          )
        },
        size: 110,
      })),
    ]
    if (sortMode === 'distance') {
      cols.push({
        id: 'distance',
        header: () => (
          <SortHeader
            active={sortMode === 'distance'}
            onClick={() => onSortModeChange?.('distance')}
            align="right"
          >
            Distancia
          </SortHeader>
        ),
        cell: ({ row }) => {
          const km = row.original.distanceKm
          return (
            <div className="text-right text-sm font-bold text-brand">
              {km != null ? formatDistance(km) : '–'}
            </div>
          )
        },
        size: 110,
      })
    }
    return cols
  }, [
    fuelTypes,
    sortMode,
    onSortModeChange,
    onFuelSortChange,
    onToggleFavorite,
    favoriteSet,
  ])

  const sorting = useMemo<SortingState>(() => {
    if (sortMode === 'name') return [{ id: 'name', desc: false }]
    if (sortMode === 'distance') return [{ id: 'distance', desc: false }]
    return [{ id: `fuel-${fuelTypes[0] ?? 'regular'}`, desc: false }]
  }, [fuelTypes, sortMode])

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    state: { sorting },
  })

  const parentRef = useRef<HTMLDivElement>(null)
  const flatRows = table.getRowModel().rows
  const isMobile = useIsMobile()

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (isMobile ? 150 : 64),
    overscan: 8,
  })

  const totalSize = rowVirtualizer.getTotalSize()
  const columnWidths = useMemo(
    () => table.getAllLeafColumns().map((c) => c.getSize()),
    [table],
  )
  const minTableWidth = useMemo(
    () => columnWidths.reduce((sum, w) => sum + w, 0),
    [columnWidths],
  )

  useEffect(() => {
    rowVirtualizer.measure()
  }, [rows.length, rowVirtualizer, isMobile])

  const alignForColumn = (id: string) =>
    id === 'name' || id === 'location' ? 'flex-start' : 'flex-end'

  return (
    <div className="island-shell overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <span>
          {isLoading
            ? 'Cargando…'
            : `${rows.length} ${canLoadMore ? 'cargados' : 'resultados'}`}
          {fuelTypes.length > 1 && (
            <span className="ml-2 text-slate-400">
              · {fuelTypes.length} combustibles activos
            </span>
          )}
        </span>
      </div>

      <div
        ref={parentRef}
        onScroll={(e) => {
          const el = e.currentTarget
          if (
            canLoadMore &&
            !isLoadingMore &&
            el.scrollHeight - el.scrollTop - el.clientHeight < 400
          ) {
            onLoadMore()
          }
        }}
        className="relative max-h-[60vh] min-h-[320px] overflow-auto"
      >
        <div
          className="grid"
          style={{ minWidth: isMobile ? undefined : `${minTableWidth}px` }}
          role="table"
        >
          {!isMobile && (
            <div
              className="sticky top-0 z-20 grid bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-500 shadow-[0_1px_0_0_theme(colors.slate.200)]"
              style={{
                gridTemplateColumns: columnWidths.map((w) => `${w}px`).join(' '),
              }}
              role="rowgroup"
            >
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => (
                  <div
                    key={header.id}
                    className="flex items-center px-3 py-2.5"
                    style={{ justifyContent: alignForColumn(header.id) }}
                    role="columnheader"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                )),
              )}
            </div>
          )}

          {rows.length === 0 && !isLoading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              Sin resultados con los filtros activos.
            </div>
          ) : (
            <div
              className="relative"
              style={{ height: `${totalSize}px` }}
              role="rowgroup"
            >
              {rowVirtualizer.getVirtualItems().map((vRow) => {
                const row = flatRows[vRow.index]
                if (!row) return null
                return (
                  <div
                    key={row.id}
                    data-index={vRow.index}
                    ref={(node) => {
                      if (node) rowVirtualizer.measureElement(node)
                    }}
                    className={cn(
                      'absolute left-0 w-full border-b bg-white',
                      isMobile
                        ? 'border-line'
                        : 'flex items-center border-slate-100 hover:bg-canvas-soft',
                    )}
                    style={
                      isMobile
                        ? { transform: `translateY(${vRow.start}px)` }
                        : {
                            transform: `translateY(${vRow.start}px)`,
                            height: `${vRow.size}px`,
                          }
                    }
                    role="row"
                  >
                    {isMobile ? (
                      <StationCard
                        row={row.original}
                        fuelTypes={fuelTypes}
                        sortMode={sortMode}
                        onToggleFavorite={onToggleFavorite}
                        isFavorite={
                          favoriteSet?.has(row.original.station.permitNumber) ?? false
                        }
                        distanceKm={row.original.distanceKm ?? undefined}
                      />
                    ) : (
                      row.getVisibleCells().map((cell) => (
                        <div
                          key={cell.id}
                          className="flex items-center overflow-hidden px-3"
                          style={{
                            width: `${cell.column.getSize()}px`,
                            justifyContent: alignForColumn(cell.column.id),
                          }}
                          role="cell"
                        >
                          <div className="min-w-0 flex-1 truncate">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-line bg-canvas-soft px-4 py-3 text-xs">
        {isLoadingMore ? (
          <span className="inline-flex items-center gap-2 font-semibold text-body">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando más…
          </span>
        ) : canLoadMore ? (
          <span className="text-mute">Desliza para cargar más</span>
        ) : rows.length > 0 ? (
          <span className="text-mute">Fin de la lista</span>
        ) : null}
      </div>
    </div>
  )
}
