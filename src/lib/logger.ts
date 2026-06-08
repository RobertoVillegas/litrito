// Lightweight structured logger with a pino-compatible line shape
// ({ level, time, msg, ...fields }). Kept dependency-free so it works in the
// browser, during SSR, and inside the Vite dev console pipe without pino's
// Node transport/worker machinery. Swap the `emit` sink for `pino` later
// without touching any call sites.
type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function emit(level: Level, msg: string, fields?: Fields) {
  const payload = { level, time: new Date().toISOString(), msg, ...fields }
  const label = `[litrito] ${level.toUpperCase()} ${msg}`
  if (level === 'error') console.error(label, payload)
  else if (level === 'warn') console.warn(label, payload)
  else console.log(label, payload)
  return payload
}

export const logger = {
  debug: (msg: string, fields?: Fields) => emit('debug', msg, fields),
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
}

// Normalizes an unknown thrown value into loggable fields.
export function errorFields(error: unknown): Fields {
  if (error instanceof Error) {
    return { errorName: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}
