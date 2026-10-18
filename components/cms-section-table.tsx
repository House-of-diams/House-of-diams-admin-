import Link from 'next/link'
import { Edit2 } from 'lucide-react'

type CMSSectionRow = {
  id: string
  label: string
  description?: string
}

type CMSSectionTableProps = {
  basePath: string
  sections: readonly CMSSectionRow[]
}

export function CMSSectionTable({ basePath, sections }: CMSSectionTableProps) {
  return (
    <div className="max-w-6xl overflow-hidden rounded-lg border border-border bg-white shadow-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-secondary/40">
            <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground">
              Name
            </th>
            <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((section) => (
            <tr key={section.id} className="border-b border-border last:border-b-0">
              <td className="px-5 py-4">
                <div className="text-sm font-medium text-foreground">{section.label}</div>
                {section.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
                ) : null}
              </td>
              <td className="px-5 py-4 text-right">
                <Link
                  href={`${basePath}/${section.id}`}
                  className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary"
                >
                  <Edit2 size={14} />
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

