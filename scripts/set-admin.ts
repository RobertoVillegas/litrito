import { closeDatabase, getDatabase } from '#/db/client'

const email = process.argv.find((argument) => argument.startsWith('--email='))?.slice(8).trim().toLowerCase()
const revoke = process.argv.includes('--revoke')

if (!email) throw new Error('Uso: bun run admin:set --email=correo@dominio [--revoke]')

try {
  const { sql } = getDatabase()
  const [user] = await sql<{ id: string; email: string }[]>`
    select id, email from "user" where lower(email) = ${email} limit 1
  `
  if (!user) throw new Error(`No existe un usuario Better Auth con email ${email}`)
  await sql`
    insert into user_roles (id, user_id, email, is_admin, created_at, updated_at)
    values (${crypto.randomUUID()}, ${user.id}, ${user.email.toLowerCase()}, ${!revoke}, now(), now())
    on conflict (user_id) do update set email = excluded.email,
      is_admin = excluded.is_admin, updated_at = now()
  `
  console.info(`${email}: administrador=${!revoke}`)
} finally {
  await closeDatabase()
}
