'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Package,
  FileText,
  Users,
  ShoppingCart,
  Settings,
  ChevronLeft,
  ChevronDown,
  Tag,
  Grid3x3,
  BookText,
  PanelsTopLeft,
  Gem,
  Ruler,
  BadgeCheck,
  Sparkles,
  Receipt,
  TicketPercent,
  BadgeAlert,
  SwatchBook,
  Inbox,
} from 'lucide-react'

const NAVIGATION_GROUPS = [
  {
    label: 'Overview',
    items: [{ name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Commerce',
    items: [
      { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
      { name: 'Customers', href: '/dashboard/customers', icon: Users },
      { name: 'Enquiries', href: '/dashboard/enquiries', icon: Inbox },
      { name: 'Coupons', href: '/dashboard/coupons', icon: TicketPercent },
    ],
  },
  {
    label: 'Products',
    items: [
      { name: 'Products', href: '/dashboard/products', icon: Package },
      { name: 'Inventory', href: '/dashboard/inventory', icon: Package },
      { name: 'Collection Products', href: '/dashboard/collection-products', icon: Package },
      { name: 'Bespoke Products', href: '/dashboard/bespoke', icon: Sparkles },
    ],
  },
  {
    label: 'Content & Merchandising',
    items: [
      { name: 'CMS', href: '/dashboard/cms', icon: FileText },
      { name: 'Docs', href: '/dashboard/cms/docs', icon: BookText },
      { name: 'Navbar Builder', href: '/dashboard/navbar-builder', icon: PanelsTopLeft },
      { name: 'Promotion', href: '/dashboard/cms/promotion', icon: BadgeAlert },
    ],
  },
]

const CATALOG_ITEMS = [
  { name: 'Categories', href: '/dashboard/catalog#categories', icon: Tag },
  { name: 'Metals', href: '/dashboard/catalog/metals', icon: Grid3x3 },
  { name: 'Material Values', href: '/dashboard/catalog/material-values', icon: Grid3x3 },
  { name: 'Styles', href: '/dashboard/catalog/styles', icon: SwatchBook },
  { name: 'Stone Shapes', href: '/dashboard/catalog/stone-shapes', icon: Gem },
  { name: 'Ring Categories', href: '/dashboard/catalog/ring-sizes', icon: Ruler },
  { name: 'Certificates', href: '/dashboard/catalog/certificates', icon: BadgeCheck },
  { name: 'GST', href: '/dashboard/catalog/gst', icon: Receipt },
]

const SYSTEM_ITEMS = [
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
]

export function Sidebar({ customerCount }: { customerCount?: number }) {
  const [collapsed, setCollapsed] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const pathname = usePathname()
  const catalogIsActive = pathname.startsWith('/dashboard/catalog')
  const catalogIsExpanded = catalogIsActive || catalogOpen

  const isAtOrBelow = (basePath: string) =>
    pathname === basePath || pathname.startsWith(`${basePath}/`)

  const isNavigationItemActive = (href: string) => {
    if (href === '/dashboard') return pathname === href

    const isNestedCmsDestination =
      href === '/dashboard/cms' &&
      (isAtOrBelow('/dashboard/cms/docs') || isAtOrBelow('/dashboard/cms/promotion'))

    return !isNestedCmsDestination && isAtOrBelow(href)
  }

  const isCatalogItemActive = (href: string) => {
    if (href === '/dashboard/catalog#categories') {
      return pathname === '/dashboard/catalog'
    }

    return isAtOrBelow(href)
  }

  const handleCatalogToggle = () => {
    if (collapsed) {
      setCollapsed(false)
      setCatalogOpen(true)
      return
    }

    setCatalogOpen((open) => !open)
  }

  return (
    <aside
      className={`flex flex-col bg-transparent transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-60'
      } overflow-hidden`}
    >
      {/* Logo / Brand */}
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && (
          <h2 className="font-jakarta font-semibold text-sm text-foreground tracking-tight">House of Diams</h2>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1.5 transition-colors duration-150 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft
            size={16}
            className={`transition-transform duration-200 text-foreground ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-4">
          {NAVIGATION_GROUPS.map((group) => (
            <section key={group.label} aria-label={group.label}>
              {!collapsed && (
                <h3 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </h3>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const isActive = isNavigationItemActive(item.href)
                  const showBadge = item.name === 'Customers' && typeof customerCount === 'number'

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                        isActive
                          ? 'bg-foreground text-white'
                          : 'text-foreground hover:bg-secondary'
                      }`}
                      title={collapsed ? item.name : undefined}
                    >
                      <Icon size={18} className="flex-shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="truncate">{item.name}</span>
                          {showBadge ? (
                            <span className="ml-auto inline-flex min-w-7 items-center justify-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                              {customerCount}
                            </span>
                          ) : null}
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}

          {/* Catalog Setup - the only collapsible navigation group */}
          <section aria-label="Catalog Setup">
            <button
              type="button"
              onClick={handleCatalogToggle}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                catalogIsActive
                  ? 'bg-foreground text-white'
                  : 'text-foreground hover:bg-secondary'
              }`}
              title={collapsed ? 'Catalog Setup' : undefined}
              aria-label={collapsed ? 'Expand sidebar and open Catalog Setup' : 'Toggle Catalog Setup'}
              aria-expanded={catalogIsExpanded}
              aria-controls="sidebar-catalog-items"
            >
              <Settings size={18} className="flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">Catalog Setup</span>
                  <ChevronDown
                    size={16}
                    className={`flex-shrink-0 transition-transform ${catalogIsExpanded ? 'rotate-180' : ''}`}
                  />
                </>
              )}
            </button>

            {/* Catalog sub-items */}
            {catalogIsExpanded && !collapsed && (
              <div id="sidebar-catalog-items" className="ml-3 mt-1 space-y-0.5 border-l-2 border-border">
                {CATALOG_ITEMS.map((item) => {
                  const Icon = item.icon
                  const isActive = isCatalogItemActive(item.href)

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                        isActive
                          ? 'bg-foreground text-white'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <Icon size={14} className="flex-shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>

          <div className="space-y-0.5 border-t border-border pt-3">
            {SYSTEM_ITEMS.map((item) => {
              const Icon = item.icon
              const isActive = isNavigationItemActive(item.href)

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 ${
                    isActive
                      ? 'bg-foreground text-white'
                      : 'text-foreground hover:bg-secondary'
                  }`}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 text-xs text-muted-foreground">
        {!collapsed && <div>v1.0.0</div>}
      </div>
    </aside>
  )
}
