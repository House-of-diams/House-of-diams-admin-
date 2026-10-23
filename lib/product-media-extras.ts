import 'server-only'
import type { AdminActor } from './auth/admin-identity-core'
import { authorizeProductRequest } from './product-session-runtime'
import { adminTransaction } from './db/pool'
import { readProductDataProvider } from './product-provider'
import { enforceVideoSave } from './video-save-admission'
import { createMediaExtrasHandlers } from './product-media-extras-core'

export * from './product-media-extras-core'

export const handleMediaExtras = createMediaExtrasHandlers({
  provider: () => readProductDataProvider(process.env),
  authorize: authorizeProductRequest as (request: Request, mutation: boolean) => Promise<{ actor: AdminActor }>,
  transaction: adminTransaction,
  enforceVideos: enforceVideoSave,
})
