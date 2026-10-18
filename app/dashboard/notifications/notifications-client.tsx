'use client'

import Link from 'next/link'
import { Bell, ExternalLink, Mail, ShoppingCart, Sparkles, Newspaper, ShoppingBag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { AdminNotificationItem, AdminNotificationType, NotificationsPageData } from '@/lib/notifications'
import { operationsFetch } from '@/lib/operations-transport'
import { useToast } from '@/hooks/use-toast'

type NotificationTab = 'all' | AdminNotificationType

const TAB_ORDER: Array<{ id: NotificationTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'order', label: 'Orders' },
  { id: 'bespoke', label: 'Bespoke' },
  { id: 'contact', label: 'Contact' },
  { id: 'product', label: 'Product' },
  { id: 'newsletter', label: 'Newsletter' },
]

function normalizeTab(value: string | null): NotificationTab {
  if (value === 'order' || value === 'bespoke' || value === 'contact' || value === 'product' || value === 'newsletter') return value
  return 'all'
}

function getIcon(type: AdminNotificationItem['type']) {
  switch (type) {
    case 'order':
      return ShoppingCart
    case 'bespoke':
      return Sparkles
    case 'product':
      return ShoppingBag
    case 'newsletter':
      return Newspaper
    default:
      return Mail
  }
}

export function NotificationsClient({ initialData }: { initialData: NotificationsPageData }) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const activeTab = normalizeTab(searchParams.get('tab'))
  const [data, setData] = useState(initialData)
  const [markingKey, setMarkingKey] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [exitingKeys, setExitingKeys] = useState<string[]>([])

  const items = useMemo(() => {
    const unreadItems = data.items.filter((item) => !item.read)
    if (activeTab === 'all') return unreadItems
    return unreadItems.filter((item) => item.type === activeTab)
  }, [activeTab, data.items])

  const applyReadLocally = (notificationKey: string) => {
    setData((current) => {
      const nextItems = current.items.filter((item) => item.notificationKey !== notificationKey)

      return {
        ...current,
        items: nextItems,
        unreadCounts: {
          all: nextItems.filter((item) => !item.read).length,
          order: nextItems.filter((item) => item.type === 'order' && !item.read).length,
          bespoke: nextItems.filter((item) => item.type === 'bespoke' && !item.read).length,
          contact: nextItems.filter((item) => item.type === 'contact' && !item.read).length,
          product: nextItems.filter((item) => item.type === 'product' && !item.read).length,
          newsletter: nextItems.filter((item) => item.type === 'newsletter' && !item.read).length,
        },
      }
    })
  }

  const animateAndRemove = async (notificationKey: string, action: () => Promise<void>, afterRemove?: () => void) => {
    setMarkingKey(notificationKey)
    try {
      await action()
      setExitingKeys((current) => (current.includes(notificationKey) ? current : [...current, notificationKey]))
      window.setTimeout(() => {
        applyReadLocally(notificationKey)
        setExitingKeys((current) => current.filter((key) => key !== notificationKey))
        afterRemove?.()
      }, 260)
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unable to mark as read.', variant: 'destructive' })
    } finally {
      setMarkingKey(null)
    }
  }

  async function markRead(notificationKey: string) {

    const response = await operationsFetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ notificationKey }),
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error ?? 'Unable to mark notification as read.')
    }
  }

  async function handleMarkAllRead() {
    setMarkingAll(true)
    try {

      const response = await operationsFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { },
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Unable to mark notifications as read.')
      }

      setData((current) => ({
        ...current,
        items: current.items.map((item) => ({ ...item, read: true })),
        unreadCounts: {
          all: 0,
          order: 0,
          bespoke: 0,
          contact: 0,
          product: 0,
          newsletter: 0,
        },
      }))
      toast({ title: 'Notifications updated', description: 'All current notifications were marked as read.' })
    } catch (error) {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : 'Unable to mark all as read.', variant: 'destructive' })
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="font-jakarta text-3xl font-semibold text-foreground">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time admin alerts from pending orders and new submissions.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TAB_ORDER.map((tab) => {
          const isActive = activeTab === tab.id
          const count = data.unreadCounts[tab.id]

          return (
            <Link
              key={tab.id}
              href={tab.id === 'all' ? '/dashboard/notifications' : `/dashboard/notifications?tab=${tab.id}`}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                isActive ? 'border-primary bg-primary text-white' : 'border-border bg-white text-foreground hover:bg-secondary'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] ${isActive ? 'bg-white/20 text-white' : 'bg-secondary text-foreground'}`}>
                {count}
              </span>
            </Link>
          )
        })}
      </div>

      <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-secondary p-2 text-foreground">
            <Bell size={16} />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{data.unreadCounts.all} unread notification{data.unreadCounts.all === 1 ? '' : 's'}</div>
            <div className="text-xs text-muted-foreground">Reading them removes them from the bell count without changing order or enquiry workflow status.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAllRead()}
          disabled={markingAll || data.unreadCounts.all === 0}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {markingAll ? 'Updating...' : 'Mark all read'}
        </button>
      </div>

      {!data.newsletterEnabled ? (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Newsletter alerts will appear here after newsletter storage is enabled in the database.
        </div>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => {
          const Icon = getIcon(item.type)
          const isExiting = exitingKeys.includes(item.notificationKey)
          return (
            <article
              key={item.id}
              className={`rounded-2xl border border-border bg-white p-5 shadow-xs transition-all duration-300 ease-out ${
                isExiting ? 'translate-x-16 opacity-0 blur-[1px]' : 'translate-x-0 opacity-100'
              }`}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
                      <Icon size={12} />
                      {item.type}
                    </span>
                    <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                      {item.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <h2 className="font-jakarta text-lg font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={markingKey === item.notificationKey}
                    onClick={() => void animateAndRemove(item.notificationKey, () => markRead(item.notificationKey))}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {markingKey === item.notificationKey ? 'Updating...' : 'Mark read'}
                  </button>
                  <Link
                    href={item.href}
                    onClick={async (event) => {
                      event.preventDefault()
                      await animateAndRemove(item.notificationKey, () => markRead(item.notificationKey), () => {
                        window.location.href = item.href
                      })
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
                  >
                    Open
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            </article>
          )
        })}

        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white px-6 py-10 text-sm text-muted-foreground">
            No notifications found for this view.
          </div>
        ) : null}
      </div>
    </div>
  )
}
