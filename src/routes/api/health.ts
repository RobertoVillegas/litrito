import { createFileRoute } from '@tanstack/react-router'
import { getDatabase } from '#/db/client'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = performance.now()
        try {
          const { sql } = getDatabase()
          const [schema, latest] = await Promise.all([
            sql<{ applied: number }[]>`
              select count(*)::int as applied
              from drizzle.__drizzle_migrations
            `,
            sql<{ status: string; finished_at: Date | null }[]>`
              select status, finished_at
              from ingestion_runs
              where kind = 'municipality_prices'
              order by started_at desc
              limit 1
            `,
          ])
          return Response.json({
            status: 'ok',
            database: 'ok',
            migrationsApplied: schema[0]?.applied ?? 0,
            latestIngestion: latest[0]
              ? {
                  status: latest[0].status,
                  finishedAt: latest[0].finished_at
                    ? new Date(latest[0].finished_at).toISOString()
                    : null,
                }
              : null,
            latencyMs: Math.round((performance.now() - startedAt) * 10) / 10,
          })
        } catch (error) {
          console.error('[health] PostgreSQL no disponible', error)
          return Response.json(
            { status: 'error', database: 'unavailable' },
            { status: 503 },
          )
        }
      },
    },
  },
})
