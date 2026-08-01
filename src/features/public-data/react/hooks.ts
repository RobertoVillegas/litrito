import { useInfiniteQuery } from '@tanstack/react-query'
import { getStationList } from '../transport/server-functions'
import type { ListStationsInput } from '../application/dtos/public-data.dto'

type StationListArgs = Omit<ListStationsInput, 'paginationOpts'>

export function usePaginatedStationList(args: StationListArgs, pageSize: number) {
  const query = useInfiniteQuery({
    queryKey: ['convexQuery', 'stations:listStations', args] as const,
    queryFn: ({ pageParam }) =>
      getStationList({
        data: {
          ...args,
          paginationOpts: { cursor: pageParam, numItems: pageSize },
        },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.isDone ? undefined : lastPage.continueCursor,
    staleTime: 60 * 1_000,
  })

  return {
    results: query.data?.pages.flatMap((page) => page.page),
    status: query.isPending
      ? ('LoadingFirstPage' as const)
      : query.isFetchingNextPage
        ? ('LoadingMore' as const)
        : query.hasNextPage
          ? ('CanLoadMore' as const)
          : ('Exhausted' as const),
    loadMore: (_count?: number) => void query.fetchNextPage(),
  }
}
