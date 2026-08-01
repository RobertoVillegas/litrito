import { closeDatabase } from '#/db/client'
import { createIngestionModule } from '#/features/ingestion/ingestion.module'

const SCHEDULES = new Set(['00:15', '00:30', '01:00', '02:00'])
const batchSize = Number(process.env.INGESTION_BATCH_SIZE ?? 50)
const ingestion = createIngestionModule(batchSize)
let running = false
let lastSchedule = ''
let lastResumeBucket = -1
let lastMaintenanceDay = ''

async function cycle(enqueue: boolean) {
  if (running) return
  running = true
  try {
    if (enqueue) {
      const queued = await ingestion.enqueue()
      console.info(queued ? `[ingestion] ${queued.queued} municipios encolados` : '[ingestion] carga UTC de hoy ya existe')
    }
    const result = await ingestion.drain()
    console.info(`[ingestion] worker terminó: ${result.claimed} reclamados, ${result.failed} fallidos`)
  } catch (error) {
    console.error('[ingestion] ciclo falló', error)
  } finally {
    running = false
  }
}

async function tick() {
  const now = new Date()
  const utcDay = now.toISOString().slice(0, 10)
  if (utcDay !== lastMaintenanceDay) {
    lastMaintenanceDay = utcDay
    const maintenance = await ingestion.runMaintenance()
    if (maintenance.accountsPurged || maintenance.runsPurged) {
      console.info(`[ingestion] mantenimiento: ${maintenance.accountsPurged} cuentas y ${maintenance.runsPurged} runs purgados`)
    }
  }
  const resumeBucket = Math.floor(now.getTime() / (15 * 60_000))
  if (resumeBucket !== lastResumeBucket) {
    lastResumeBucket = resumeBucket
    const resumed = await ingestion.resumeStale()
    if (resumed > 0) console.warn(`[ingestion] ${resumed} tareas stale recuperadas`)
    await cycle(false)
  }

  const time = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const scheduleKey = `${now.toISOString().slice(0, 10)}T${time}`
  if (SCHEDULES.has(time) && scheduleKey !== lastSchedule) {
    lastSchedule = scheduleKey
    await cycle(true)
  }
}

async function shutdown(signal: string) {
  console.info(`[ingestion] ${signal}; cerrando conexiones`)
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
  console.info(`[ingestion] activo; batch=${batchSize}; horarios UTC=${[...SCHEDULES].join(',')}`)
  await tick()
  setInterval(() => void tick(), 60_000)
}
