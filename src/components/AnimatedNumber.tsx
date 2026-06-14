import type { ReactNode } from 'react'
import NumberFlow from '@number-flow/react'

// Animated price in Mexican pesos. Falls back to a dash when the value is null/undefined.
export function AnimatedPrice({
  value,
  className,
  fallback = '—',
}: {
  value: number | null | undefined
  className?: string
  fallback?: ReactNode
}) {
  if (value == null) return <span className={className}>{fallback}</span>
  return (
    <NumberFlow
      value={value}
      locales="es-MX"
      format={{ style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      className={className}
    />
  )
}

// Animated integer with Spanish grouping (e.g. 14,847). Falls back to a dash when null/undefined.
export function AnimatedCount({
  value,
  className,
  fallback = '—',
}: {
  value: number | null | undefined
  className?: string
  fallback?: ReactNode
}) {
  if (value == null) return <span className={className}>{fallback}</span>
  return (
    <NumberFlow
      value={value}
      locales="es-MX"
      format={{ useGrouping: true, maximumFractionDigits: 0 }}
      className={className}
    />
  )
}
