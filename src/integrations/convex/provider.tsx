import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import { authClient } from '#/lib/auth-client'
import { createConvexQueryClient } from './query-client'

const convexQueryClient = createConvexQueryClient()

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ConvexBetterAuthProvider
      client={convexQueryClient.convexClient}
      authClient={authClient}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}
