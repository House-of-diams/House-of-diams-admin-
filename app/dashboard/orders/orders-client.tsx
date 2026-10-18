'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Download, Eye, Filter, Search } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { operationsFetch } from '@/lib/operations-transport'

export type OrderRow = {
  id: string
  orderNumber: string
  customer: string
  customerEmail: string
  total: number
  paymentStatus: string
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  createdAt: string
  items: number
}

export type OrdersResponse = {
  items: OrderRow[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const authedFetch = operationsFetch

export function OrdersClient({ initialData }: { initialData: OrdersResponse }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | OrderRow['status']>('all')
  const [page, setPage] = useState(initialData.page)
  const [loading, setLoading] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>(initialData.items)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)

  const loadOrders = async (nextPage: number) => {
    setLoading(true)
    try {
      const response = await authedFetch(`/api/orders?page=${nextPage}`)
      const payload = (await response.json().catch(() => null)) as OrdersResponse | null
      if (response.ok && payload) {
        setOrders(payload.items)
        setTotalPages(payload.totalPages)
        setPage(payload.page)
      }
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      order.customer.toLowerCase().includes(search.toLowerCase()) ||
      order.customerEmail.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: OrderRow['status']) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700'
      case 'shipped':
        return 'bg-blue-100 text-blue-700'
      case 'processing':
        return 'bg-yellow-100 text-yellow-700'
      case 'pending':
        return 'bg-gray-100 text-gray-700'
      case 'cancelled':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getPaymentColor = (paymentStatus: string) => {
    switch (paymentStatus.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-700'
      case 'failed': return 'bg-red-100 text-red-700'
      default: return 'bg-yellow-100 text-yellow-700'
    }
  }

  const formatStoreAmount = (amount: number) => `USD ${amount.toLocaleString()}`

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">View and manage real customer orders from checkout.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-primary/90">
          <Download size={18} />
          Export
        </button>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="relative min-w-64 flex-1">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Items</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Payment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <tr key={order.id} className="border-b border-border transition-colors hover:bg-secondary/50">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{order.orderNumber}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <div>{order.customer}</div>
                      <div className="text-xs text-muted-foreground">{order.customerEmail}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{order.items}</td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{formatStoreAmount(order.total)}</td>
                    <td className="px-6 py-4 text-sm"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getPaymentColor(order.paymentStatus)}`}>{order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}</span></td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <Link href={`/dashboard/orders/${order.id}`} className="inline-flex rounded p-1.5 transition-colors hover:bg-secondary" title="View Details">
                        <Eye size={16} className="text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-sm text-muted-foreground">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {loading ? 'Updating orders...' : 'Showing up to 20 orders per page'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOrders(Math.max(1, page - 1))}
            disabled={loading || page === 1}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <button
            type="button"
            onClick={() => void loadOrders(Math.min(totalPages, page + 1))}
            disabled={loading || page >= totalPages}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
