import { Link } from '@tanstack/react-router'
import { Fuel } from 'lucide-react'
import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-[78vh] w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 self-start">
          <span className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-brand">
            <Fuel className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-2xl text-ink">Litrito</span>
        </Link>
        <h1 className="font-display mt-8 text-4xl text-ink sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-6 text-body">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-sm text-body">{footer}</div>}
      </div>
    </main>
  )
}
