import { cache } from 'react'
import { readAdminAuthProvider } from './auth/integration'
import { resolveAdminServerSession } from './auth/admin-session'
import { authorizeProductPage } from './product-server-request'
import { ProductSessionError } from './product-session-error'

export type AdminServerSession = {
  userId: string
  email: string | null
  role: string
}

export const getAdminServerSession = cache(async (): Promise<AdminServerSession | null> => {
  try {
    return await resolveAdminServerSession({ provider: readAdminAuthProvider, authorize: authorizeProductPage })
  } catch (error) {
    if (error instanceof ProductSessionError && [401, 403].includes(error.status)) return null
    throw new Error('Admin authentication unavailable')
  }
})
