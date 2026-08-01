import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import * as schema from './schema'

type DatabaseConnection = {
  db: PostgresJsDatabase<typeof schema>
  sql: Sql
}

let connection: DatabaseConnection | undefined

export function getDatabase(): DatabaseConnection {
  if (connection) return connection

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL')
  }

  const sql = postgres(databaseUrl, {
    max: Number(process.env.POSTGRES_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      application_name: process.env.POSTGRES_APPLICATION_NAME ?? 'litrito-web',
      statement_timeout: 30_000,
    },
  })
  connection = { sql, db: drizzle({ client: sql, schema }) }
  return connection
}

export async function closeDatabase() {
  if (!connection) return
  const active = connection
  connection = undefined
  await active.sql.end({ timeout: 5 })
}
