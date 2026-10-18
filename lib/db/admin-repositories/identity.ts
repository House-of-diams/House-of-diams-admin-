import 'server-only'
import { adminQuery } from '../pool'
import { createAdminIdentityLookup } from './identity-core'
export const lookupAdminIdentity = createAdminIdentityLookup({ query: async (text, values) => ({ rows: await adminQuery(text, values) }) })
