import { useMemo } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { Combobox, type ComboboxItem } from './ui/combobox'

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

const FUEL_OPTIONS: { value: FuelType; label: string; color: string }[] = [
  { value: 'regular', label: 'Regular', color: 'bg-emerald-500' },
  { value: 'premium', label: 'Premium', color: 'bg-amber-500' },
  { value: 'diesel', label: 'Diésel', color: 'bg-slate-600' },
  { value: 'duba', label: 'Diésel bajo azufre', color: 'bg-sky-600' },
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
  const selectedState = state.stateIds[0] ?? null
  const selectedMuni = state.municipalityIds[0] ?? null

  const stateOptions = useMemo<ComboboxItem[]>(
    () => states.map((s) => ({ id: s.externalId, name: s.name, count: s.count })),
    [states],
  )
  const muniOptions = useMemo<ComboboxItem[]>(
    () =>
      selectedState
        ? municipalities
            .filter((m) => m.stateExternalId === selectedState)
            .map((m) => ({
              id: `${m.stateExternalId}|${m.externalId}`,
              name: m.name,
              count: m.count,
            }))
        : [],
    [municipalities, selectedState],
  )

  const update = (patch: Partial<FilterState>) => onChange({ ...state, ...patch })

  return (
    <div className="island-shell space-y-4 rounded-lg p-4">
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="grid grid-cols-3 gap-1 rounded-[6px] border border-slate-200 bg-white p-1 sm:inline-grid sm:w-auto sm:rounded-full">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ sortMode: opt.value })}
              className={cn(
                'rounded-[5px] px-3 py-2 text-xs font-bold transition sm:rounded-full sm:py-1',
                state.sortMode === opt.value
                  ? 'bg-ink text-white'
                  : 'text-slate-600 hover:bg-slate-100',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 sm:min-w-[200px] sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={state.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Buscar por nombre o dirección"
            className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition',
              'w-full justify-center sm:w-auto',
              hasPreciseLocation
                ? 'border-brand bg-[#fff0f0] text-brand'
                : 'border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand',
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {hasPreciseLocation ? 'Ubicación precisa activa' : 'Usar mi ubicación'}
          </button>
        )}
      </div>

      {/* Fuel chips */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span>Combustibles</span>
          <span className="text-slate-300">·</span>
          <span>Doble click para fijar principal</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-1.5">
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
                className={cn(
                  'inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border px-2.5 py-2 text-xs font-bold transition sm:w-auto sm:rounded-full sm:py-1',
                  checked
                    ? isPrimary
                      ? 'border-ink bg-ink text-white'
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

      {/* Location comboboxes */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Combobox
          label="Estado"
          placeholder="Todos los estados"
          items={stateOptions}
          value={selectedState}
          onValueChange={(id) =>
            update({ stateIds: id ? [id] : [], municipalityIds: [] })
          }
        />
        <Combobox
          label="Municipio"
          placeholder={selectedState ? 'Todos los municipios' : 'Elige un estado primero'}
          items={muniOptions}
          value={selectedMuni}
          disabled={!selectedState}
          onValueChange={(id) => update({ municipalityIds: id ? [id] : [] })}
        />
      </div>
    </div>
  )
}
