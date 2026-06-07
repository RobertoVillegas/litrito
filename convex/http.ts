import { httpRouter } from 'convex/server'
import { httpAction } from './_generated/server'
import { api } from './_generated/api'
import { authComponent, createAuth } from './auth'

const http = httpRouter()

authComponent.registerRoutes(http, createAuth, { cors: true })

http.route({
  path: '/stations/export',
  method: 'GET',
  handler: httpAction(async (ctx) => {
    type ExportPage = {
      stations: unknown[]
      isDone: boolean
      continueCursor: string
    }
    const stations: unknown[] = []
    let cursor: string | null = null
    // Page through the catalog so no single query exceeds Convex read limits.
    for (;;) {
      const result: ExportPage = await ctx.runQuery(
        api.stations.exportStationsPage,
        { paginationOpts: { numItems: 500, cursor } },
      )
      stations.push(...result.stations)
      if (result.isDone) break
      cursor = result.continueCursor
    }

    const withCoordinates = stations.filter(
      (s) => (s as { latitude: number | null }).latitude != null,
    ).length

    const data = {
      exportedAt: new Date().toISOString(),
      total: stations.length,
      withCoordinates,
      stations,
    }

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }),
})

export default http
