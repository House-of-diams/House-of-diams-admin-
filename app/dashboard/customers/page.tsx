import { readOperationsProvider } from '@/lib/operations-provider'
import { getCustomerIdentities } from '@/lib/admin-users'
import { getAdminCustomerUsers } from '@/lib/admin-users'
import { CustomersClient } from './customers-client'

export type CustomerRow = {
  id: string
  name: string
  email: string
  joinDate: string
  status: 'active' | 'invited' | 'verified' | 'unverified'
}

async function getCustomers(): Promise<CustomerRow[]> {
  if(readOperationsProvider(process.env)==='rds')return (await getCustomerIdentities()).map(user=>({id:user.id,name:user.name,email:user.email,joinDate:user.firstSeenAt,status:user.emailVerified?'verified' as const:'unverified' as const}))
  const users = await getAdminCustomerUsers()

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email ?? 'No email',
    joinDate: user.createdAt,
    status: user.confirmed ? 'active' : 'invited',
  }))
}

export default async function CustomersPage() {
  const customers = await getCustomers()
  return <CustomersClient initialCustomers={customers} identityMode={readOperationsProvider(process.env)==='rds'} />
}
