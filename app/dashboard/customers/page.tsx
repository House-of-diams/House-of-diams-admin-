import { readOperationsProvider } from '@/lib/operations-provider'
import { getCustomerIdentities } from '@/lib/admin-users'
import { getAdminCustomerUsers } from '@/lib/admin-users'
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
  const identityMode = readOperationsProvider(process.env) === 'rds'
  if (identityMode) {
    const result = await getCustomerIdentities(pageParam((await searchParams).page))
    const customers: CustomerRow[] = result.items.map(user => ({ id: user.id, name: user.name, email: user.email, joinDate: user.firstSeenAt, status: user.emailVerified ? 'verified' : 'unverified' }))
    return <CustomersClient initialCustomers={customers} identityMode server={{ page: result.page, total: result.total }} />
  }
  const users = await getAdminCustomerUsers()
  const customers: CustomerRow[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email ?? 'No email',
    joinDate: user.createdAt,
    status: user.confirmed ? 'active' : 'invited',
  }))
  return <CustomersClient initialCustomers={customers} />
}
