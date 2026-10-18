'use client'

import { cmsFetch } from '@/lib/cms-transport'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, ImageIcon } from 'lucide-react'
import { CMSTabs } from '@/components/cms-tabs'
import { TablePagination } from '@/components/table-pagination'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useToast } from '@/hooks/use-toast'

export type BlogListItem = {
  id: number | string
  slug: string
  title: string
  category: string
  author: string
  date_label: string
  read_time: string
  is_published: boolean
  sort_order: number
  updated_at: string
}

const PAGE_SIZE = 20

export function BlogListClient({ initialItems }: { initialItems: BlogListItem[] }) {
  const { toast } = useToast()
  const [items, setItems] = useState<BlogListItem[]>(initialItems)
  const [status, setStatus] = useState(initialItems.length ? `${initialItems.length} blog${initialItems.length === 1 ? '' : 's'} ready` : 'No blogs yet')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<BlogListItem | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const visibleItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return items.slice(start, start + PAGE_SIZE)
  }, [items, page])

  const deleteBlog = async () => {
    if (!deleteTarget) return





    const target = deleteTarget
    setIsDeleting(true)
    try {
      const currentResponse = await cmsFetch(`/api/cms/blog/posts/${target.id}`, { headers: {  } })
      const current = (await currentResponse.json().catch(() => null)) as { revision?: string; error?: string } | null
      if (!currentResponse.ok || !current?.revision) throw new Error(current?.error ?? 'Unable to verify the current blog post.')

      const response = await cmsFetch(`/api/cms/blog/posts/${target.id}`, {
        method: 'DELETE',
        headers: {  'content-type': 'application/json' },
        body: JSON.stringify({ request_id: crypto.randomUUID(), expected_revision: current.revision }),
      })
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!response.ok || !payload?.ok) throw new Error(payload?.error ?? 'Delete response was interrupted. Reload before retrying.')

      setItems((prev) => prev.filter((item) => item.id !== target.id))
      setDeleteTarget(null)
      setStatus('Blog deleted')
      toast({ title: 'Deleted', description: 'Blog post deleted successfully.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete blog.'
      setStatus(message)
      toast({ title: 'Delete failed', description: message, variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      <CMSTabs />
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-jakarta text-3xl font-semibold text-foreground">Blog</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage all blog posts and create new articles.</p>
            <p className="mt-2 text-xs text-muted-foreground">{status}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/cms/blog/hero" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
              <ImageIcon size={16} />
              Blog Hero
            </Link>
            <Link href="/dashboard/cms/blog/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90">
              <Plus size={16} />
              Create Blog
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-xs">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/40">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Order</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Title</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Category</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Author</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">Published</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No blog posts have been created yet.
                  </td>
                </tr>
              ) : null}
              {visibleItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-4 text-sm">{item.sort_order}</td>
                  <td className="px-5 py-4 text-sm">{item.title}</td>
                  <td className="px-5 py-4 text-sm">{item.category}</td>
                  <td className="px-5 py-4 text-sm">{item.author}</td>
                  <td className="px-5 py-4 text-sm">{item.is_published ? 'Yes' : 'No'}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link href={`/dashboard/cms/blog/${item.id}`} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                        <Edit2 size={14} />
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length > PAGE_SIZE ? (
          <TablePagination page={page} totalItems={items.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        ) : null}
      </div>
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete blog post?"
        description={deleteTarget ? `This permanently deletes "${deleteTarget.title}", including its tags and content blocks.` : undefined}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        isLoading={isDeleting}
        onConfirm={deleteBlog}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
