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
