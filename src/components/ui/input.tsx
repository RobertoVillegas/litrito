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
  /** Validation message; sets aria-invalid and shows the message below the field. */
  error?: string
  /** Mark the field invalid (red border + aria-invalid) without an own message — e.g. for a form-level error. */
  invalid?: boolean
}

export function Input({ label, hideLabel, error, invalid, id, className, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const isInvalid = Boolean(error) || invalid
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className={cn('block text-sm font-semibold text-ink', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          inputClass,
          isInvalid && 'border-brand focus:border-brand focus:ring-brand',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-brand">
          {error}
        </p>
      )}
    </div>
  )
}
