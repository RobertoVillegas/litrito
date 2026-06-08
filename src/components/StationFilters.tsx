import { useMemo, useState } from 'react'
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
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

type ComboOption = { id: string; name: string; count: number }

function Combobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string
  placeholder: string
  options: ComboOption[]
  value: string | null
  onChange: (id: string | null) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((o) => o.id === value) ?? null
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options
    return base.slice(0, 80)
  }, [options, query])

  return (
    <div className="min-w-0 flex-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="relative mt-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-[6px] border px-3 text-sm font-semibold transition',
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
              : selected
                ? 'border-brand bg-[#fff0f0] text-brand'
                : 'border-slate-200 bg-white text-slate-700 hover:border-brand/40',
          )}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          {selected ? (
            <X
              className="h-4 w-4 shrink-0 opacity-70 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
            />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          )}
        </button>

        {open && !disabled && (
          <>
            <div className="fixed inset-0 z-[40]" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 z-[50] mt-1 rounded-[6px] border border-line bg-white shadow-[0_12px_40px_rgba(37,40,43,0.16)]">
              <div className="relative border-b border-line p-2">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar…"
                  className="h-9 w-full rounded-[6px] border border-slate-200 bg-white pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {filtered.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-400">Sin resultados</div>
                ) : (
                  filtered.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        onChange(o.id)
                        setOpen(false)
                        setQuery('')
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-canvas-soft',
                        o.id === value ? 'font-bold text-brand' : 'text-ink',
                      )}
                    >
                      <span className="truncate">{o.name}</span>
                      <span className="shrink-0 text-[11px] font-bold text-slate-400">
                        {o.count}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
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

  const stateOptions = useMemo<ComboOption[]>(
    () => states.map((s) => ({ id: s.externalId, name: s.name, count: s.count })),
    [states],
  )
  const muniOptions = useMemo<ComboOption[]>(
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ sortMode: opt.value })}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-bold transition',
                state.sortMode === opt.value
                  ? 'bg-ink text-white'
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
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition',
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
          options={stateOptions}
          value={selectedState}
          onChange={(id) =>
            update({ stateIds: id ? [id] : [], municipalityIds: [] })
          }
        />
        <Combobox
          label="Municipio"
          placeholder={selectedState ? 'Todos los municipios' : 'Elige un estado primero'}
          options={muniOptions}
          value={selectedMuni}
          disabled={!selectedState}
          onChange={(id) => update({ municipalityIds: id ? [id] : [] })}
        />
      </div>
    </div>
  )
}
