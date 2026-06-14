import { cn } from '../lib/utils'
import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-[6px] bg-slate-200/80', className)}
      {...props}
    />
  )
}

export function DarkSkeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-[6px] bg-white/12', className)}
      {...props}
    />
  )
}

/**
 * Stands in for a single line of text. `lead` must match the text's line-box
 * height (its line-height, e.g. h-5 for text-sm, h-6 for leading-6) so the real
 * copy slots in without nudging layout — text reserves its full line height, not
 * just the glyph height. The shimmer bar is thinner and vertically centered.
 */
export function SkeletonLine({
  lead,
  width,
  bar = 'h-3',
  dark = false,
  className,
}: {
  lead: string
  width: string
  bar?: string
  dark?: boolean
  className?: string
}) {
  const Bar = dark ? DarkSkeleton : Skeleton
  return (
    <div aria-hidden="true" className={cn('flex items-center', lead, className)}>
      <Bar className={cn(bar, width)} />
    </div>
  )
}

// Stand-in for a chart while it loads on the client. Faint bars so the area
// reads as "a chart is coming" instead of an empty gap.
const CHART_BARS = [52, 74, 43, 88, 61, 79, 48, 92, 67, 58, 83, 70]

export function ChartSkeleton({
  height = 240,
  className,
}: {
  height?: number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-end gap-2 rounded-[6px] border border-line bg-canvas-soft px-4 pb-4 pt-6',
        className,
      )}
      style={{ height }}
    >
      {CHART_BARS.map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative h-[55vh] min-h-[320px] overflow-hidden rounded-md border border-line bg-canvas-soft',
        className,
      )}
    >
      <Skeleton className="absolute left-4 top-4 h-9 w-28 bg-white" />
      <Skeleton className="absolute bottom-4 left-4 h-24 w-10 bg-white" />
      <Skeleton className="absolute right-4 top-4 h-10 w-10 rounded-full bg-white" />
      <Skeleton className="absolute left-[18%] top-[28%] h-7 w-7 rounded-full bg-brand/30" />
      <Skeleton className="absolute left-[46%] top-[46%] h-7 w-7 rounded-full bg-brand/30" />
      <Skeleton className="absolute right-[22%] top-[32%] h-7 w-7 rounded-full bg-brand/30" />
      <Skeleton className="absolute bottom-[22%] right-[34%] h-7 w-7 rounded-full bg-brand/30" />
    </div>
  )
}
