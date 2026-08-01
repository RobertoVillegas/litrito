import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { communityModule } from '../community.module'
import { getAuth } from '#/lib/auth-server'

const requireUser = createServerOnlyFn(async () => {
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session?.user) throw new Error('No autorizado')
  return session.user
})

export const listFavorites = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return communityModule.listFavorites(user.id)
})

export const setFavorite = createServerFn({ method: 'POST' })
  .inputValidator((data: { stationPermitNumber: string; favorited: boolean }) => data)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await communityModule.setFavorite(user.id, data.stationPermitNumber, data.favorited)
    return { favorited: data.favorited }
  })

export const myAccountDeletion = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return communityModule.getDeletion(user.id)
})

export const requestAccountDeletion = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await requireUser()
  return communityModule.requestDeletion(user)
})

export const cancelAccountDeletion = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await requireUser()
  await communityModule.cancelDeletion(user.id)
  return { cancelled: true }
})
