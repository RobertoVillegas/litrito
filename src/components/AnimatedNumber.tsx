import type { ReactNode } from 'react'
import NumberFlow, { useCanAnimate } from '@number-flow/react'
import { formatCurrency } from '#/lib/format'

// Animated price in Mexican pesos. Falls back to a dash when the value is null/undefined.
// On the server or when motion is reduced, render a static formatted value to avoid
// SSR/hydration issues with the number-flow custom element.
export function AnimatedPrice({
  value,
  className,
  fallback = '—',
}: {
  value: number | null | undefined
  className?: string
  fallback?: ReactNode
}) {
  const canAnimate = useCanAnimate()
  if (value == null) return <span className={className}>{fallback}</span>
  if (!canAnimate) return <span className={className}>{formatCurrency(value)}</span>
  return (
    <NumberFlow
      value={value}
      locales="es-MX"
      format={{ style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }}
      className={className}
    />
  )
}

const COUNT_FORMAT = new Intl.NumberFormat('es-MX', {
  useGrouping: true,
  maximumFractionDigits: 0,
})

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
  const canAnimate = useCanAnimate()
  if (value == null) return <span className={className}>{fallback}</span>
  if (!canAnimate) return <span className={className}>{COUNT_FORMAT.format(value)}</span>
  return (
    <NumberFlow
      value={value}
      locales="es-MX"
      format={{ useGrouping: true, maximumFractionDigits: 0 }}
      className={className}
    />
  )
}
