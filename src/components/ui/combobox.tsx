import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, X } from 'lucide-react'
import { cn } from '#/lib/utils'

export type ComboboxItem = { id: string; name: string; count?: number }

// Single-select, searchable dropdown built on base-ui Combobox (keyboard nav,
// focus management and ARIA handled by the library). Keeps an id-based value
// contract so call sites stay simple.
export function Combobox({
  label,
  items,
  value,
  onValueChange,
  placeholder,
  disabled,
}: {
  label: string
  items: ComboboxItem[]
  value: string | null
  onValueChange: (id: string | null) => void
  placeholder?: string
  disabled?: boolean
}) {
  const selected = items.find((i) => i.id === value) ?? null
  return (
    <BaseCombobox.Root
      items={items}
      value={selected}
      onValueChange={(next) => onValueChange((next as ComboboxItem | null)?.id ?? null)}
      itemToStringLabel={(item) => item.name}
      disabled={disabled}
    >
      <div className="min-w-0 flex-1">
        <BaseCombobox.Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
          {label}
        </BaseCombobox.Label>
        <BaseCombobox.InputGroup className="relative mt-1.5">
          <BaseCombobox.Input
            placeholder={placeholder}
            className={cn(
              'h-10 w-full rounded-[6px] border px-3 pr-16 text-sm font-semibold transition focus:outline-none focus:ring-1 focus:ring-brand',
              disabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300'
                : selected
                  ? 'border-brand bg-[#fff0f0] text-brand focus:border-brand'
                  : 'border-slate-200 bg-white text-slate-700 focus:border-brand',
            )}
          />
          {selected && !disabled && (
            <BaseCombobox.Clear
              aria-label="Limpiar selección"
              className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </BaseCombobox.Clear>
          )}
          <BaseCombobox.Trigger
            aria-label="Abrir opciones"
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
          >
            <ChevronDown className="h-4 w-4" />
          </BaseCombobox.Trigger>
        </BaseCombobox.InputGroup>

        <BaseCombobox.Portal>
          <BaseCombobox.Positioner sideOffset={4} className="z-[1100]">
            <BaseCombobox.Popup className="max-h-64 w-[var(--anchor-width)] min-w-[12rem] overflow-y-auto rounded-[6px] border border-line bg-white py-1 shadow-[0_12px_40px_rgba(37,40,43,0.16)]">
              <BaseCombobox.Empty className="px-3 py-3 text-sm text-slate-400">
                Sin resultados
              </BaseCombobox.Empty>
              <BaseCombobox.List>
                {(item: ComboboxItem) => (
                  <BaseCombobox.Item
                    key={item.id}
                    value={item}
                    className={cn(
                      'flex w-full cursor-default items-center justify-between gap-2 px-3 py-2 text-left text-sm text-ink transition',
                      'data-[highlighted]:bg-canvas-soft data-[selected]:font-bold data-[selected]:text-brand',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <BaseCombobox.ItemIndicator>
                        <Check className="h-3.5 w-3.5 shrink-0 text-brand" />
                      </BaseCombobox.ItemIndicator>
                      <span className="truncate">{item.name}</span>
                    </span>
                    {item.count != null && (
                      <span className="shrink-0 text-[11px] font-bold text-slate-400">
                        {item.count}
                      </span>
                    )}
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </div>
    </BaseCombobox.Root>
  )
}
