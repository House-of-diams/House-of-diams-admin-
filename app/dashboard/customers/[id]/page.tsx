import Link from 'next/link'
import { notFound } from 'next/navigation'
import { operationsPage } from '@/lib/operations-page-data'
import { createCustomersRepository } from '@/lib/db/admin-repositories/customers'
import { uuid } from '@/lib/db/admin-repositories/operations-shared'
import { formatUsd } from '@/lib/money'
export default async function CustomerDetailPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params
 const data=await operationsPage(async db=>{try{uuid(id)}catch{notFound()}const repo=createCustomersRepository(db);const customer=await repo.one(id);if(!customer)notFound();return {customer,orders:await repo.orders(id)}})
 if(!data)return <main className="p-8"><Link href="/dashboard/customers">Back to customers</Link><p className="mt-4">Historical customer detail is unavailable. Use the registration list.</p></main>
 return <main className="p-8"><Link href="/dashboard/customers">Back to customers</Link><h1 className="mt-4 text-2xl">{data.customer.name}</h1><p>{data.customer.email}</p><p>First seen locally: {data.customer.firstSeenAt}</p><p>Stored email verification: {data.customer.emailVerified?'verified':'unverified'}</p><h2 className="mt-6 text-xl">Orders linked to this customer identity</h2><ul>{data.orders.map(order=><li key={order.id}><Link href={`/dashboard/orders/${order.id}`}>{order.order_number}</Link> · {formatUsd(Number(order.total_amount))} · {order.status}</li>)}</ul></main>
}
