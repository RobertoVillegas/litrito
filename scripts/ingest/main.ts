import { closeDatabase } from '#/db/client'
import { createIngestionModule } from '#/features/ingestion/ingestion.module'

const SCHEDULES = new Set(['00:15', '00:30', '01:00', '02:00'])
const batchSize = Number(process.env.INGESTION_BATCH_SIZE ?? 50)
const ingestion = createIngestionModule(batchSize)
let running = false
let lastSchedule = ''
let lastResumeBucket = -1
let lastMaintenanceDay = ''
let lastEnqueueDay = ''
let lastEnqueueAttemptBucket = -1

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
) {
  console[level](JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'litrito-ingestion',
    event,
    ...fields,
  }))
}

async function cycle(enqueue: boolean) {
  if (running) return false
  running = true
  const startedAt = performance.now()
  try {
    if (enqueue) {
      const queued = await ingestion.enqueue()
      log('info', 'daily_queue', {
        status: queued ? 'created' : 'already_exists',
        queued: queued?.queued ?? 0,
      })
    }
    const result = await ingestion.drain()
    log('info', 'cycle_completed', {
      enqueue,
      claimed: result.claimed,
      failed: result.failed,
      durationMs: Math.round(performance.now() - startedAt),
    })
    return true
  } catch (error) {
    log('error', 'cycle_failed', {
      enqueue,
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  } finally {
    running = false
  }
}

async function tick() {
  const now = new Date()
  const utcDay = now.toISOString().slice(0, 10)
  if (utcDay !== lastMaintenanceDay) {
    const maintenance = await ingestion.runMaintenance()
    lastMaintenanceDay = utcDay
    if (maintenance.accountsPurged || maintenance.runsPurged) {
      log('info', 'maintenance_completed', maintenance)
    }
  }
  const resumeBucket = Math.floor(now.getTime() / (15 * 60_000))
  if (resumeBucket !== lastResumeBucket) {
    const resumed = await ingestion.resumeStale()
    lastResumeBucket = resumeBucket
    if (resumed > 0) log('warn', 'stale_tasks_resumed', { resumed })
    await cycle(false)
  }

  const time = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const scheduleKey = `${now.toISOString().slice(0, 10)}T${time}`
  const afterFirstSchedule = time >= '00:15'
  const scheduled = SCHEDULES.has(time) && scheduleKey !== lastSchedule
  const catchUp =
    afterFirstSchedule &&
    lastEnqueueDay !== utcDay &&
    lastEnqueueAttemptBucket !== resumeBucket
  if (scheduled || catchUp) {
    lastEnqueueAttemptBucket = resumeBucket
    const succeeded = await cycle(true)
    if (succeeded) {
      lastEnqueueDay = utcDay
      if (scheduled) lastSchedule = scheduleKey
    }
  }
}

async function shutdown(signal: string) {
  log('info', 'shutdown', { signal })
  await closeDatabase()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

if (process.argv.includes('--enqueue')) {
  await cycle(true)
  await closeDatabase()
} else if (process.argv.includes('--once')) {
  await ingestion.resumeStale()
  await cycle(false)
  await closeDatabase()
} else {
  log('info', 'worker_started', { batchSize, schedulesUtc: [...SCHEDULES] })
  const safeTick = () =>
    tick().catch((error: unknown) =>
      log('error', 'tick_failed', {
        error: error instanceof Error ? error.message : String(error),
      }),
    )
  await safeTick()
  setInterval(safeTick, 60_000)
}
