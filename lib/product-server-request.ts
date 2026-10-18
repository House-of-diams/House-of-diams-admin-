import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { readAuthConfig } from './auth/config'
import { authorizeProductRequest } from './product-session-runtime'

/** Read-only page authorization uses opaque cookies and the configured canonical origin. */
export const authorizeProductPage = cache(async () => {
  const config = readAuthConfig()
  const incoming = await headers()
  return authorizeProductRequest(new Request(`${config.origin}/dashboard/products`, { headers: { cookie: incoming.get('cookie') ?? '' } }))
})
