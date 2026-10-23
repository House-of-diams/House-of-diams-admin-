import { readOperationsProvider } from '@/lib/operations-provider'
import { getCustomerIdentities } from '@/lib/admin-users'
import { CustomersClient } from './customers-client'
import { pageParam } from '@/lib/page-param'

export type CustomerRow = {
  id: string
  name: string
  email: string
  joinDate: string
  status: 'active' | 'invited' | 'verified' | 'unverified'
}


export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  readOperationsProvider(process.env)
  const result = await getCustomerIdentities(pageParam((await searchParams).page))
  const customers: CustomerRow[] = result.items.map(user => ({ id: user.id, name: user.name, email: user.email, joinDate: user.firstSeenAt, status: user.emailVerified ? 'verified' : 'unverified' }))
  return <CustomersClient initialCustomers={customers} identityMode server={{ page: result.page, total: result.total }} />
}
