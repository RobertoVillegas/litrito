import { useId } from 'react'
import type { ComponentProps } from 'react'
import { cn } from '#/lib/utils'

// 16px text (text-base) keeps iOS Safari from auto-zooming inputs under 16px
// on focus; this is the canonical input style for the app.
export const inputClass =
  'h-11 w-full rounded-[6px] border border-line bg-white px-3.5 text-base focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand'

export type InputProps = ComponentProps<'input'> & {
  /** Accessible name for the field. Always required; hide it visually with `hideLabel`. */
  label: string
  /** Render the label as screen-reader-only (e.g. when a placeholder conveys the field visually). */
  hideLabel?: boolean
}

export function Input({ label, hideLabel, id, className, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={cn('block text-sm font-semibold text-ink', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input id={inputId} className={cn(inputClass, className)} {...props} />
    </div>
  )
}
