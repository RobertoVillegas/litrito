import { ConvexQueryClient } from '@convex-dev/react-query'

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL

if (!CONVEX_URL) {
  console.error('missing envar CONVEX_URL')
}

export function createConvexQueryClient() {
  return new ConvexQueryClient(CONVEX_URL, {
    dangerouslyUseInconsistentQueriesDuringSSR: true,
  })
}
