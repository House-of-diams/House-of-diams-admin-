'use client'

import { useState } from 'react'
import { Upload, Trash2, Copy, Search, LayoutGrid, List } from 'lucide-react'

interface MediaFile {
  id: number
  name: string
  type: 'image' | 'video' | 'document'
  size: string
  uploadDate: string
  thumbnail?: string
}

export default function MediaPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [search, setSearch] = useState('')
  const [files, setFiles] = useState<MediaFile[]>([
    {
      id: 1,
      name: 'emerald-pendant-01.jpg',
      type: 'image',
      size: '2.4 MB',
      uploadDate: '2024-01-15',
    },
    {
      id: 2,
      name: 'diamond-ring-showcase.mp4',
      type: 'video',
      size: '45.2 MB',
      uploadDate: '2024-01-10',
    },
    {
      id: 3,
      name: 'gold-chain-detail.jpg',
      type: 'image',
      size: '1.8 MB',
      uploadDate: '2024-01-08',
    },
    {
      id: 4,
      name: 'product-catalog.pdf',
      type: 'document',
      size: '8.5 MB',
      uploadDate: '2024-01-05',
    },
  ])

  const deleteFile = (id: number) => {
    setFiles(files.filter((f) => f.id !== id))
  }

  const copyUrl = (name: string) => {
    navigator.clipboard.writeText(`/media/${name}`)
  }

  const filteredFiles = files.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.type.toLowerCase().includes(search.toLowerCase())
  )

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'image':
        return 'bg-blue-100 text-blue-700'
      case 'video':
        return 'bg-purple-100 text-purple-700'
      case 'document':
        return 'bg-orange-100 text-orange-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Media Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all images, videos, and documents</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors duration-200">
          <Upload size={18} />
          Upload Files
        </button>
      </div>

      {/* Toolbar */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="flex-1 relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-4 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 border border-border rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-colors duration-150 ${
              viewMode === 'grid'
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-colors duration-150 ${
              viewMode === 'list'
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div className="mb-8 rounded-lg border-2 border-dashed border-border p-12 text-center hover:border-primary transition-colors cursor-pointer bg-secondary/30">
        <Upload size={32} className="mx-auto text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-foreground">Drag and drop files here</p>
        <p className="text-xs text-muted-foreground mt-1">or click to browse (max 100MB per file)</p>
      </div>

      {/* Files Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="aspect-square bg-secondary flex items-center justify-center">
                <div className="text-center">
                  <div className={`inline-block px-3 py-1 rounded text-xs font-medium ${getTypeColor(file.type)} mb-2`}>
                    {file.type.toUpperCase()}
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-medium text-foreground truncate" title={file.name}>
                  {file.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{file.size}</p>
                <p className="text-xs text-muted-foreground">{file.uploadDate}</p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => copyUrl(file.name)}
                    className="flex-1 rounded p-1.5 text-xs font-medium border border-border hover:bg-secondary transition-colors"
                  >
                    <Copy size={14} className="mx-auto" />
                  </button>
                  <button
                    onClick={() => deleteFile(file.id)}
                    className="flex-1 rounded p-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={14} className="mx-auto" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Files List View */}
      {viewMode === 'list' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Upload Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => (
                  <tr key={file.id} className="border-b border-border hover:bg-secondary/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground font-medium">{file.name}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getTypeColor(file.type)}`}>
                        {file.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{file.size}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{file.uploadDate}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyUrl(file.name)}
                          className="rounded p-1.5 hover:bg-secondary transition-colors"
                          title="Copy URL"
                        >
                          <Copy size={16} className="text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => deleteFile(file.id)}
                          className="rounded p-1.5 hover:bg-red-100 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} className="text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredFiles.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">No files found.</p>
        </div>
      )}
    </div>
  )
}
