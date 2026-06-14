import { ConvexQueryClient } from '@convex-dev/react-query'

export function createConvexQueryClient() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL
  if (!convexUrl) {
    throw new Error('VITE_CONVEX_URL is required')
  }
  return new ConvexQueryClient(convexUrl, {
    dangerouslyUseInconsistentQueriesDuringSSR: true,
  })
}
