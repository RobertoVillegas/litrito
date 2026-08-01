import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import postgres from 'postgres'

type SnapshotDocument = Record<string, unknown> & { _id: string }

async function* snapshotDocuments(snapshotPath: string, path: string) {
  const child = spawn('unzip', ['-p', snapshotPath, path], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (!child.stdout || !child.stderr) throw new Error(`No se pudo leer ${path}`)
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as SnapshotDocument
  }
  if ((await exit) !== 0) throw new Error(stderr.trim() || `Falló la lectura de ${path}`)
}

const date = (value: unknown) => new Date(Number(value))
const optionalDate = (value: unknown) => value == null ? null : date(value)

async function main() {
  const snapshot = process.argv.find((arg) => arg.startsWith('--snapshot='))?.slice(11)
  if (!snapshot) throw new Error('--snapshot=/ruta/export.zip es obligatorio')
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es obligatorio')

  const users: SnapshotDocument[] = []
  const accounts: SnapshotDocument[] = []
  for await (const row of snapshotDocuments(snapshot, '_components/betterAuth/user/documents.jsonl')) users.push(row)
  for await (const row of snapshotDocuments(snapshot, '_components/betterAuth/account/documents.jsonl')) accounts.push(row)

  const sql = postgres(process.env.DATABASE_URL, { max: 1 })
  try {
    const result = await sql.begin(async (tx) => {
      const [{ count }] = await tx<[{ count: number }]>`select count(*)::int as count from "user"`
      if (count > 0 && !process.argv.includes('--merge')) {
        throw new Error(`PostgreSQL ya contiene ${count} usuarios; usa --merge para conciliar por email`)
      }

      const userIds = new Map<string, string>()
      for (const source of users) {
        const [target] = await tx<{ id: string }[]>`
          insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
          values (${source._id}, ${String(source.name ?? '')}, ${String(source.email).toLowerCase()},
            ${Boolean(source.emailVerified)}, ${source.image == null ? null : String(source.image)},
            ${date(source.createdAt)}, ${date(source.updatedAt)})
          on conflict (email) do update set
            name = excluded.name, email_verified = excluded.email_verified,
            image = excluded.image, updated_at = excluded.updated_at
          returning id
        `
        userIds.set(source._id, target.id)
      }

      let accountCount = 0
      for (const source of accounts) {
        const userId = userIds.get(String(source.userId))
        if (!userId) throw new Error('Cuenta Better Auth sin usuario correspondiente')
        await tx`
          insert into account
            (id, account_id, provider_id, user_id, access_token, refresh_token,
             id_token, access_token_expires_at, refresh_token_expires_at, scope,
             password, created_at, updated_at)
          values
            (${source._id}, ${String(source.accountId)}, ${String(source.providerId)}, ${userId},
             ${source.accessToken == null ? null : String(source.accessToken)},
             ${source.refreshToken == null ? null : String(source.refreshToken)},
             ${source.idToken == null ? null : String(source.idToken)},
             ${optionalDate(source.accessTokenExpiresAt)}, ${optionalDate(source.refreshTokenExpiresAt)},
             ${source.scope == null ? null : String(source.scope)},
             ${source.password == null ? null : String(source.password)},
             ${date(source.createdAt)}, ${date(source.updatedAt)})
          on conflict (id) do update set user_id = excluded.user_id,
            access_token = excluded.access_token, refresh_token = excluded.refresh_token,
            id_token = excluded.id_token, password = excluded.password,
            updated_at = excluded.updated_at
        `
        accountCount += 1
      }
      return { users: userIds.size, accounts: accountCount }
    })
    console.table([{ entity: 'users', source: users.length, postgres: result.users }, { entity: 'accounts', source: accounts.length, postgres: result.accounts }])
    console.info('Sesiones omitidas deliberadamente; todos deberán iniciar sesión de nuevo.')
  } finally {
    await sql.end()
  }
}

await main()
