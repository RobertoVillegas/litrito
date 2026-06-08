import { useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '../lib/utils'

export type FuelType = 'regular' | 'premium' | 'diesel' | 'duba'

export type SortMode = 'price' | 'distance' | 'name'

export type FilterOption = {
  externalId: string
  name: string
  count: number
}

export type FilterState = {
  fuelTypes: FuelType[]
  primaryFuel: FuelType
  stateIds: string[]
  municipalityIds: string[]
  search: string
  sortMode: SortMode
}

type Props = {
  state: FilterState
  states: FilterOption[]
  municipalities: (FilterOption & { stateExternalId: string })[]
  onChange: (next: FilterState) => void
  hasPreciseLocation: boolean
  onRequestPreciseLocation: () => void
}

const FUEL_OPTIONS: { value: FuelType; label: string; short: string; color: string }[] = [
  { value: 'regular', label: 'Regular', short: 'REG', color: 'bg-emerald-500' },
  { value: 'premium', label: 'Premium', short: 'PREM', color: 'bg-amber-500' },
  { value: 'diesel', label: 'Diésel', short: 'DSL', color: 'bg-slate-600' },
  { value: 'duba', label: 'Diésel bajo azufre', short: 'DUBA', color: 'bg-sky-600' },
]

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'price', label: 'Precio' },
  { value: 'distance', label: 'Distancia' },
  { value: 'name', label: 'Nombre' },
]

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function StationFilters({
  state,
  states,
  municipalities,
  onChange,
  hasPreciseLocation,
  onRequestPreciseLocation,
}: Props) {
  const availableMunis = useMemo(
    () =>
      state.stateIds.length === 0
        ? municipalities
        : municipalities.filter((m) => state.stateIds.includes(m.stateExternalId)),
    [municipalities, state.stateIds],
  )

  const update = (patch: Partial<FilterState>) => onChange({ ...state, ...patch })

  return (
    <div className="island-shell space-y-4 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ sortMode: opt.value })}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-bold transition',
                state.sortMode === opt.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={state.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Buscar por nombre o dirección"
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {state.search && (
            <button
              type="button"
              onClick={() => update({ search: '' })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {state.sortMode === 'distance' && (
          <button
            type="button"
            onClick={onRequestPreciseLocation}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-bold transition',
              hasPreciseLocation
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {hasPreciseLocation ? 'Ubicación precisa activa' : 'Usar mi ubicación'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span>Combustibles</span>
          <span className="text-slate-300">·</span>
          <span>Click para resaltar</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FUEL_OPTIONS.map((opt) => {
            const checked = state.fuelTypes.includes(opt.value)
            const isPrimary = state.primaryFuel === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (!checked) {
                    update({ fuelTypes: [...state.fuelTypes, opt.value] })
                  } else if (state.fuelTypes.length > 1) {
                    const next = toggle(state.fuelTypes, opt.value)
                    update({
                      fuelTypes: next,
                      primaryFuel: isPrimary
                        ? next.includes(state.primaryFuel)
                          ? state.primaryFuel
                          : next[0]
                        : state.primaryFuel,
                    })
                  }
                }}
                onDoubleClick={() => {
                  if (checked) update({ primaryFuel: opt.value })
                }}
                title={checked ? 'Doble click para fijar como principal' : 'Click para mostrar'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition',
                  checked
                    ? isPrimary
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700'
                    : 'border-slate-200 bg-slate-50 text-slate-400 line-through',
                )}
              >
                <span className={cn('h-2 w-2 rounded-full', opt.color)} />
                {opt.label}
                {isPrimary && checked && (
                  <span className="ml-1 text-[9px] font-black uppercase tracking-wider opacity-80">
                    principal
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Estados
            {state.stateIds.length > 0 && (
              <button
                type="button"
                onClick={() => update({ stateIds: [], municipalityIds: [] })}
                className="ml-2 text-[10px] font-bold text-brand hover:text-brand-dark"
              >
                Limpiar
              </button>
            )}
          </span>
        </div>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {states.map((s) => {
            const checked = state.stateIds.includes(s.externalId)
            return (
              <button
                key={s.externalId}
                type="button"
                onClick={() => {
                  const next = toggle(state.stateIds, s.externalId)
                  const removed = new Set(state.stateIds.filter((id) => !next.includes(id)))
                  update({
                    stateIds: next,
                    municipalityIds: state.municipalityIds.filter(
                      (m) => !removed.has(m.split('|')[0] ?? ''),
                    ),
                  })
                }}
                disabled={s.count === 0 && !checked}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
                  checked
                    ? 'border-brand bg-[#fff0f0] text-brand'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand/40',
                )}
              >
                {s.name}
                <span className="text-[10px] font-bold text-slate-500">{s.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {availableMunis.length > 0 && state.stateIds.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Municipios
              {state.municipalityIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => update({ municipalityIds: [] })}
                  className="ml-2 text-[10px] font-bold text-brand hover:text-brand-dark"
                >
                  Limpiar
                </button>
              )}
            </span>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {availableMunis.map((m) => {
              const key = `${m.stateExternalId}|${m.externalId}`
              const checked = state.municipalityIds.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ municipalityIds: toggle(state.municipalityIds, key) })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-bold transition',
                    checked
                      ? 'border-brand bg-[#fff0f0] text-brand'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-brand/40',
                  )}
                >
                  {m.name}
                  <span className="text-[10px] font-bold text-slate-500">{m.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
