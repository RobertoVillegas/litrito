import { useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { ArrowDownUp, Loader2, Star } from 'lucide-react'
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
}

type Props = {
  rows: StationRow[]
  fuelTypes: FuelType[]
  sortMode: SortMode
  isLoading: boolean
  canLoadMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onToggleFavorite?: (permitNumber: string) => void
  favoriteSet?: Set<string>
  userLocation?: { latitude: number; longitude: number } | null
  distanceByPermit?: Map<string, number>
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

export function StationTable({
  rows,
  fuelTypes,
  sortMode,
  isLoading,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
  onToggleFavorite,
  favoriteSet,
  userLocation,
  distanceByPermit,
}: Props) {
  const columns = useMemo<ColumnDef<StationRow>[]>(() => {
    const cols: ColumnDef<StationRow>[] = [
      {
        id: 'name',
        header: () => (
          <div className="flex items-center gap-1.5">
            <span>Estación</span>
            {sortMode === 'name' && <ArrowDownUp className="h-3 w-3" />}
          </div>
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
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
                      : 'border-slate-200 bg-white text-slate-400 hover:text-amber-500',
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
                <div className="truncate text-sm font-black text-slate-950">
                  {s.name}
                </div>
                <div className="text-[10px] font-semibold text-slate-500">
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
        header: 'Ubicación',
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
          <div className="flex items-center justify-end gap-1">
            <span className="uppercase">{ft}</span>
            {sortMode === 'price' && <ArrowDownUp className="h-3 w-3" />}
          </div>
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
    if (sortMode === 'distance' && userLocation) {
      cols.push({
        id: 'distance',
        header: () => (
          <div className="flex items-center justify-end gap-1">
            <span>Distancia</span>
          </div>
        ),
        cell: ({ row }) => {
          const km = distanceByPermit?.get(row.original.station.permitNumber)
          return (
            <div className="text-right text-sm font-bold text-emerald-700">
              {km != null ? formatDistance(km) : '–'}
            </div>
          )
        },
        size: 110,
      })
    }
    return cols
  }, [fuelTypes, sortMode, onToggleFavorite, favoriteSet, userLocation, distanceByPermit])

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
  })

  const parentRef = useRef<HTMLDivElement>(null)
  const flatRows = table.getRowModel().rows

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
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
  }, [rows.length, rowVirtualizer])

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
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Desliza para ver más →
        </span>
      </div>

      <div
        ref={parentRef}
        className="relative max-h-[60vh] min-h-[320px] overflow-auto"
      >
        <div
          className="grid"
          style={{ minWidth: `${minTableWidth}px` }}
          role="table"
        >
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
                    className="absolute left-0 flex w-full items-center border-b border-slate-100 bg-white hover:bg-emerald-50/30"
                    style={{
                      transform: `translateY(${vRow.start}px)`,
                      height: `${vRow.size}px`,
                    }}
                    role="row"
                  >
                    {row.getVisibleCells().map((cell) => (
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
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 px-4 py-3">
        {canLoadMore ? (
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={onLoadMore}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
          >
            {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cargar 50 más
          </button>
        ) : rows.length > 0 ? (
          <span className="text-xs text-slate-500">Fin de la lista</span>
        ) : null}
      </div>
    </div>
  )
}
