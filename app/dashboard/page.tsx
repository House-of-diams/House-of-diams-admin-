import { operationsPage } from '@/lib/operations-page-data'
import { dashboardSources } from '@/lib/db/admin-repositories/dashboard'
import Link from 'next/link'
import { TrendingUp, Package, Users, ShoppingCart, ArrowRight } from 'lucide-react'
import { formatUsd } from '@/lib/money'
import { createSupabaseAdminClient } from '@/lib/admin-supabase'
import { getAdminCustomerUsers } from '@/lib/admin-users'
import { getAdminServerSession } from '@/lib/admin-server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

type DashboardStat = {
  label: string
  value: string
  icon: typeof Package
  note: string
}

type RecentOrder = {
  id: string
  orderNumber: string
  customer: string
  total: number
  status: string
  createdAt: string
}

type TopSeller = {
  name: string
  unitsSold: number
  revenue: number
}

type SalesBarPoint = {
  label: string
  revenue: number
  orders: number
}

type RevenueRow = { total_amount: number | string | null; status: string | null }
type RecentOrderRow = {
  id: string
  order_number: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  customer_email: string | null
  total_amount: number | string | null
  status: string | null
  created_at: string
}

function formatCurrency(value: number) {
  return formatUsd(value)
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatStatus(status: string | null | undefined) {
  if (!status) return 'Pending'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

async function getDashboardData() {
  if (!await getAdminServerSession()) redirect('/login')
  const {productsCount,ordersCount,revenueResult,recentOrdersResult,orderItemsResult,customerCount,customerLabel,customerNote}=await operationsPage(dashboardSources,async()=>{
  const supabase = createSupabaseAdminClient()

  const [
    productsCount,
    ordersCount,
    revenueResult,
    recentOrdersResult,
    orderItemsResult,
  ] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('orders').select('total_amount, status'),
    supabase
      .from('orders')
      .select('id, order_number, customer_first_name, customer_last_name, customer_email, total_amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('order_items').select('product_name, quantity, line_total'),
  ])

  const customers = await getAdminCustomerUsers()

return {productsCount,ordersCount,revenueResult,recentOrdersResult,orderItemsResult,customerCount:customers.length,customerLabel:'Historical registrations',customerNote:'Supabase auth registrations'}
})

  const revenueRows = (revenueResult.data ?? []) as unknown as RevenueRow[]
  const paidStatuses = new Set(['paid', 'confirmed', 'processing', 'shipped', 'delivered'])
  const totalRevenue = revenueRows.reduce((sum, row) => {
    const status = String(row.status ?? '').toLowerCase()
    if (paidStatuses.size > 0 && status && !paidStatuses.has(status)) return sum
    return sum + Number(row.total_amount ?? 0)
  }, 0)

  const recentOrders: RecentOrder[] = ((recentOrdersResult.data ?? []) as unknown as RecentOrderRow[]).map((order) => ({
    id: order.id,
    orderNumber: order.order_number || 'Order',
    customer:
      [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') ||
      order.customer_email ||
      'Customer',
    total: Number(order.total_amount ?? 0),
    status: formatStatus(order.status),
    createdAt: order.created_at,
  }))

  const salesMap = new Map<string, TopSeller>()
  for (const item of orderItemsResult.data ?? []) {
    const name = item.product_name || 'Untitled Product'
    const existing = salesMap.get(name) ?? {
      name,
      unitsSold: 0,
      revenue: 0,
    }

    existing.unitsSold += Number(item.quantity ?? 0)
    existing.revenue += Number(item.line_total ?? 0)
    salesMap.set(name, existing)
  }

  const topSellers = Array.from(salesMap.values())
    .sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold
      return b.revenue - a.revenue
    })
    .slice(0, 3)

  const monthlyMap = new Map<string, SalesBarPoint>()
  for (const order of recentOrdersResult.data ?? []) {
    const date = new Date(order.created_at)
    if (Number.isNaN(date.getTime())) continue
    const label = new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(date)
    const current = monthlyMap.get(label) ?? { label, revenue: 0, orders: 0 }
    current.revenue += Number(order.total_amount ?? 0)
    current.orders += 1
    monthlyMap.set(label, current)
  }
  const salesBars = Array.from(monthlyMap.values())
  const maxRevenue = Math.max(...salesBars.map((item) => item.revenue), 1)

  const stats: DashboardStat[] = [
    {
      label: 'Total Products',
      value: String(productsCount.count ?? 0),
      icon: Package,
      note: 'Live product count',
    },
    {
      label: 'Total Orders',
      value: String(ordersCount.count ?? 0),
      icon: ShoppingCart,
      note: 'Real checkout orders',
    },
    {
      label: customerLabel,
      value: String(customerCount),
      icon: Users,
      note: customerNote,
    },
    {
      label: 'Revenue',
      value: formatCurrency(totalRevenue),
      icon: TrendingUp,
      note: 'Based on paid/fulfilled orders',
    },
  ]

  return { stats, recentOrders, topSellers, salesBars, maxRevenue }
}

export default async function DashboardPage() {
  const { stats, recentOrders, topSellers, salesBars, maxRevenue } = await getDashboardData()

  return (
    <main className="p-6 lg:p-8">
      <header className="mb-7">
        <h1 className="font-jakarta text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Live overview of store activity and product performance.</p>
      </header>

      <section aria-label="Store metrics" className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          const tone = [
            { border: '#7C3AED', iconBackground: '#EFF6FF', icon: '#3B6EA8' },
            { border: '#7C3AED', iconBackground: '#FFFBEB', icon: '#A16207' },
            { border: '#7C3AED', iconBackground: '#F5F3FF', icon: '#7661A8' },
            { border: '#7C3AED', iconBackground: '#ECFDF5', icon: '#2F7D62' },
          ][index]

          return (
            <div
              key={stat.label}
              className="rounded-lg border border-l-[3px] border-border bg-white px-5 py-5 shadow-xs"
              style={{ borderLeftColor: tone.border }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-2 font-jakarta text-3xl font-semibold tabular-nums tracking-tight text-primary">{stat.value}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{stat.note}</p>
                </div>
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: tone.iconBackground,
                    color: tone.icon,
                  }}
                  aria-hidden="true"
                >
                  <Icon size={17} strokeWidth={1.8} />
                </span>
              </div>
            </div>
          )
        })}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="overflow-hidden rounded-lg border border-border bg-white lg:col-span-2">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-jakarta text-base font-semibold text-foreground">Recent Orders</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest orders placed through checkout</p>
            </div>
            <Link
              href="/dashboard/orders"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              View all
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-secondary/20">
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Order</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Customer</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                    <th scope="col" className="whitespace-nowrap px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-secondary/15">
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-primary">{order.orderNumber}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-foreground">{order.customer}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted-foreground">{formatDate(order.createdAt)}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="size-1.5 rounded-full bg-primary/55" aria-hidden="true" />
                          {order.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right text-sm font-medium tabular-nums text-foreground">{formatCurrency(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-44 items-center justify-center px-5 text-sm text-muted-foreground">
              No real orders found yet.
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 className="font-jakarta text-base font-semibold text-foreground">Top Selling Products</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Ranked by units sold</p>
            </div>
            <Link
              href="/dashboard/products"
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              View more
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          {topSellers.length > 0 ? (
            <ol>
              {topSellers.map((product, index) => (
                <li key={product.name} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-4 last:border-b-0">
                  <span className="font-jakarta text-lg font-semibold tabular-nums text-primary/35">{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-foreground">{product.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground"><span className="tabular-nums">{product.unitsSold}</span> units sold</p>
                  </div>
                  <p className="text-right text-sm font-medium tabular-nums text-foreground">{formatCurrency(product.revenue)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-44 items-center justify-center px-5 text-center text-sm text-muted-foreground">
              No top-selling products yet.
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-jakarta text-base font-semibold text-foreground">Revenue Snapshot</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Month-wise revenue from recent order totals</p>
        </div>

        {salesBars.length > 0 ? (
          <div className="overflow-x-auto px-5 pb-5 pt-7 sm:px-6">
            <div className="relative min-w-[36rem]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-44" aria-hidden="true">
                <div className="absolute inset-x-0 top-0 border-t border-border/60" />
                <div className="absolute inset-x-0 top-1/3 border-t border-border/60" />
                <div className="absolute inset-x-0 top-2/3 border-t border-border/60" />
                <div className="absolute inset-x-0 bottom-0 border-t border-border" />
              </div>
              <div className="relative flex h-44 items-end justify-around gap-5 px-4">
                {salesBars.map((point, index) => (
                  <div key={point.label} className="flex h-full min-w-20 flex-1 items-end justify-center">
                    <div
                      className="relative w-full max-w-16 transition-[height] duration-300"
                      style={{
                        height: `${Math.max(10, (point.revenue / maxRevenue) * 100)}%`,
                        backgroundColor: `var(--chart-${(index % 5) + 1})`,
                      }}
                    >
                      <span className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-foreground">
                        {formatCurrency(point.revenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-around gap-5 px-4 pt-3">
                {salesBars.map((point) => (
                  <div key={point.label} className="min-w-20 flex-1 text-center">
                    <p className="text-xs font-medium text-foreground">{point.label}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{point.orders} orders</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center px-5 text-sm text-muted-foreground">
            Not enough order data for the chart yet.
          </div>
        )}
      </section>
    </main>
  )
}
