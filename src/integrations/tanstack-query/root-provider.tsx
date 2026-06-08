import { QueryClient } from '@tanstack/react-query'
import { createConvexQueryClient } from '../convex/query-client'

export function getContext() {
  const convexQueryClient = createConvexQueryClient()
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
      },
    },
  })
  convexQueryClient.connect(queryClient)

  return {
    convexQueryClient,
    queryClient,
  }
}
export default function TanstackQueryProvider() {}
