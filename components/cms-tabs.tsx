'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const CMS_TABS = [
  { label: 'Home', href: '/dashboard/cms/home', key: 'home' },
  { label: 'Bespoke', href: '/dashboard/cms/bespoke', key: 'bespoke' },
  { label: 'Collection', href: '/dashboard/cms/collection', key: 'collection' },
  { label: 'About', href: '/dashboard/cms/about', key: 'about' },
  { label: 'Contact', href: '/dashboard/cms/contact', key: 'contact' },
  { label: 'Blog', href: '/dashboard/cms/blog', key: 'blog' },
  { label: 'Education', href: '/dashboard/cms/education', key: 'education' },
  { label: 'Docs', href: '/dashboard/cms/docs', key: 'docs' },
  { label: 'Support', href: '/dashboard/cms/support', key: 'support' },
  { label: 'Summary', href: '/dashboard/cms/summary', key: 'summary' },
  { label: 'Service Banner', href: '/dashboard/cms/service-banner', key: 'service-banner' },
  { label: 'Checkout Result', href: '/dashboard/cms/checkout-result', key: 'checkout-result' },
  { label: 'Promotion', href: '/dashboard/cms/promotion', key: 'promotion' },
]

export function CMSTabs() {
  const pathname = usePathname()

  return (
    <div className="border-b border-border">
      <div className="flex gap-0 overflow-x-auto [scrollbar-width:thin]">
        {CMS_TABS.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
