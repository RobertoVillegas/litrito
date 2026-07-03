import { Link } from '@tanstack/react-router'
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
          <img
            src="/litrito-logo-128.webp"
            alt=""
            className="h-10 w-10 object-contain"
            width={40}
            height={40}
          />
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
