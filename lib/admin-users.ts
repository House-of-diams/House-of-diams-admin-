import { readOperationsProvider } from './operations-provider'
import { operationsPage } from './operations-page-data'
import { createCustomersRepository } from './db/admin-repositories/customers'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'

export type AdminCustomerUser = {
  id: string
  email: string | null
  name: string
  createdAt: string
  confirmed: boolean
}

export async function getAdminCustomerUsers(): Promise<AdminCustomerUser[]> {
  if(readOperationsProvider(process.env)==='rds') throw new Error('Historical Supabase registrations are unavailable in RDS mode. Use the customer identity read model.')
  const supabase = createSupabaseAdminClient()
  const users: AdminCustomerUser[] = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    })

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data.users ?? []).map((user) => {
      const metadata = user.user_metadata ?? {}
      const rawUsername = typeof metadata.username === 'string' ? metadata.username.trim() : ''
      const rawFullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
      const fallbackName = user.email?.split('@')[0] ?? 'Unnamed user'

      return {
        id: user.id,
        email: user.email ?? null,
        name: rawUsername || rawFullName || fallbackName,
        createdAt: user.created_at ?? new Date().toISOString(),
        confirmed: Boolean(user.email_confirmed_at),
      }
    })

    users.push(...batch)

    if (batch.length < perPage) break
    page += 1
  }

  return users
}

export function getCustomerIdentities(page = 1) { return operationsPage(db=>createCustomersRepository(db).list(page),async()=>{throw new Error('Customer identity view requires RDS mode.')}) }
export function getCustomerMetrics() { return operationsPage(db=>createCustomersRepository(db).metrics(),async()=>({persistedCustomerIdentities:null,guestOrders:null,legacyAccountOrders:null,historicalRegistrations:(await getAdminCustomerUsers()).length})) }
