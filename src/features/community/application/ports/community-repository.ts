export type AccountDeletion = { requestedAt: string; scheduledAt: string }

export interface CommunityRepository {
  listFavorites(userId: string): Promise<string[]>
  setFavorite(userId: string, permitNumber: string, favorited: boolean): Promise<void>
  getDeletion(userId: string): Promise<AccountDeletion | null>
  requestDeletion(user: { id: string; email: string; name?: string | null }): Promise<AccountDeletion>
  cancelDeletion(userId: string): Promise<void>
}
