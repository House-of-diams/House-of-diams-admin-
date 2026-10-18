'use client'

import { useMemo, useState } from 'react'
import { Mail, User, CalendarDays, ShieldCheck } from 'lucide-react'
import { TablePagination } from '@/components/table-pagination'

type CustomerRow = {
  id: string
  name: string
  email: string
  joinDate: string
  status: 'active' | 'invited' | 'verified' | 'unverified'
}

const PAGE_SIZE = 20

function formatDate(dateValue: string) {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(dateValue))
}

export function CustomersClient({ initialCustomers, identityMode=false }: { initialCustomers: CustomerRow[];identityMode?:boolean }) {
  const [page, setPage] = useState(1)

  const visibleCustomers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return initialCustomers.slice(start, start + PAGE_SIZE)
  }, [initialCustomers, page])

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {identityMode ? 'Persisted customer identities. First seen and stored email verification do not indicate current account activity.' : 'Historical registrations from Supabase authentication'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-white px-4 py-2 text-sm text-muted-foreground shadow-xs">
          Total users: <span className="font-semibold text-foreground">{initialCustomers.length}</span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">{identityMode ? 'First seen locally' : 'Registered'}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">User ID</th>
              </tr>
            </thead>
            <tbody>
              {visibleCustomers.map((customer) => (
                <tr key={customer.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-foreground">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
                        <User size={16} />
                      </div>
                      <div>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">{identityMode ? 'Customer identity' : 'Historical registration'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail size={14} />
                      <span>{customer.email}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={14} />
                      <span>{formatDate(customer.joinDate)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        customer.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      <ShieldCheck size={12} />
                      {identityMode ? (customer.status==='verified'?'Stored email verified':'Stored email unverified') : (customer.status==='active'?'Confirmed':'Pending confirmation')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-muted-foreground">{customer.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {initialCustomers.length > PAGE_SIZE ? (
        <TablePagination page={page} totalItems={initialCustomers.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      ) : null}

      {initialCustomers.length === 0 && (
        <div className="mt-12 rounded-lg border border-dashed border-border bg-white p-10 text-center">
          <p className="text-muted-foreground">No records found.</p>
        </div>
      )}
    </div>
  )
}
