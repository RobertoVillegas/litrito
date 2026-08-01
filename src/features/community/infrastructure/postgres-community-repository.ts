import type { CommunityRepository } from '../application/ports/community-repository'
import { getDatabase } from '#/db/client'

export class PostgresCommunityRepository implements CommunityRepository {
  async listFavorites(userId: string) {
    const { sql } = getDatabase()
    const rows = await sql<{ station_permit_number: string }[]>`
      select station_permit_number from station_favorites
      where user_id = ${userId} order by created_at
    `
    return rows.map((row) => row.station_permit_number)
  }

  async setFavorite(userId: string, permitNumber: string, favorited: boolean) {
    const { sql } = getDatabase()
    if (favorited) {
      await sql`
        insert into station_favorites (id, user_id, station_permit_number, created_at)
        values (${crypto.randomUUID()}, ${userId}, ${permitNumber}, now())
        on conflict (user_id, station_permit_number) do nothing
      `
    } else {
      await sql`delete from station_favorites where user_id = ${userId} and station_permit_number = ${permitNumber}`
    }
  }

  async getDeletion(userId: string) {
    const { sql } = getDatabase()
    const [row] = await sql<{ requested_at: Date; scheduled_at: Date }[]>`
      select requested_at, scheduled_at from account_deletions
      where auth_user_id = ${userId}
    `
    return row ? {
      requestedAt: row.requested_at.toISOString(),
      scheduledAt: row.scheduled_at.toISOString(),
    } : null
  }

  async requestDeletion(user: { id: string; email: string; name?: string | null }) {
    const { sql } = getDatabase()
    const [row] = await sql<{ requested_at: Date; scheduled_at: Date }[]>`
      insert into account_deletions
        (id, auth_user_id, email, name, requested_at, scheduled_at)
      values
        (${crypto.randomUUID()}, ${user.id}, ${user.email}, ${user.name ?? null}, now(), now() + interval '15 days')
      on conflict (auth_user_id) do update set requested_at = now(),
        scheduled_at = now() + interval '15 days', email = excluded.email,
        name = excluded.name
      returning requested_at, scheduled_at
    `
    return {
      requestedAt: row.requested_at.toISOString(),
      scheduledAt: row.scheduled_at.toISOString(),
    }
  }

  async cancelDeletion(userId: string) {
    const { sql } = getDatabase()
    await sql`delete from account_deletions where auth_user_id = ${userId}`
  }
}
