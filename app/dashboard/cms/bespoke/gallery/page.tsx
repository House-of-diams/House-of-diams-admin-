'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Save, ArrowLeft, Plus, Trash2, Edit2 } from 'lucide-react'

interface PortfolioItem {
  id: string
  title: string
  tag: string
  category: string
  gemType: string
  gemColor: string
  mediaUrl: string
  isVideo: boolean
}

export default function BespokeGalleryEditor() {
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  const handleAddItem = () => {
    const newItem: PortfolioItem = {
      id: Math.random().toString(36).substr(2, 9),
      title: '',
      tag: '',
      category: '',
      gemType: '',
      gemColor: '',
      mediaUrl: '',
      isVideo: false,
    }
    setItems([...items, newItem])
    setEditingId(newItem.id)
    setHasChanges(true)
  }

  const handleUpdateItem = (id: string, updates: Partial<PortfolioItem>) => {
    setItems(items.map(item => item.id === id ? { ...item, ...updates } : item))
    setHasChanges(true)
  }

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
    setHasChanges(true)
    if (editingId === id) setEditingId(null)
  }

  const handleSave = () => {
    console.log('Saving bespoke gallery:', items)
    setHasChanges(false)
    alert('Changes saved successfully!')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-8">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href="/dashboard/cms/bespoke"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Bespoke
          </Link>
        </div>

        <div className="mb-10">
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">Portfolio Gallery</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage bespoke portfolio items</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* List of Items */}
          <div className="space-y-4">
            <h3 className="font-jakarta text-base font-semibold text-foreground">Items List</h3>
            <div className="bg-white border border-border rounded-lg divide-y divide-border">
              {items.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground italic">No items added yet</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded bg-secondary flex items-center justify-center overflow-hidden border border-border">
                        {item.mediaUrl ? (
                          <img src={item.mediaUrl} alt={item.title} className="h-full w-full object-cover" />
                        ) : (
                          <Edit2 size={16} className="text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title || 'Untitled Item'}</p>
                        <p className="text-xs text-muted-foreground">{item.category || 'No category'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setEditingId(item.id)}
                        className="p-2 text-primary hover:bg-primary/10 rounded transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-2 text-destructive hover:bg-destructive/10 rounded transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={handleAddItem}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-all w-full justify-center"
            >
              <Plus size={16} />
              Add New Item
            </button>
          </div>

          {/* Edit Form */}
          <div>
            <h3 className="font-jakarta text-base font-semibold text-foreground mb-4">Edit Details</h3>
            {editingId ? (
              <div className="bg-white border border-border rounded-lg p-6 shadow-xs space-y-4">
                {(() => {
                  const item = items.find(i => i.id === editingId)!
                  return (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Title</label>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateItem(item.id, { title: e.target.value })}
                          className="w-full rounded border border-border px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Tag</label>
                          <input
                            type="text"
                            value={item.tag}
                            onChange={(e) => handleUpdateItem(item.id, { tag: e.target.value })}
                            className="w-full rounded border border-border px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Category</label>
                          <select
                            value={item.category}
                            onChange={(e) => handleUpdateItem(item.id, { category: e.target.value })}
                            className="w-full rounded border border-border px-3 py-2 text-sm bg-white"
                          >
                            <option value="">Select Category</option>
                            <option value="rings">Rings</option>
                            <option value="necklaces">Necklaces</option>
                            <option value="bracelets">Bracelets</option>
                            <option value="earrings">Earrings</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Gem Type</label>
                          <input
                            type="text"
                            value={item.gemType}
                            onChange={(e) => handleUpdateItem(item.id, { gemType: e.target.value })}
                            className="w-full rounded border border-border px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Gem Color</label>
                          <input
                            type="text"
                            value={item.gemColor}
                            onChange={(e) => handleUpdateItem(item.id, { gemColor: e.target.value })}
                            className="w-full rounded border border-border px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wider">Media URL</label>
                        <input
                          type="text"
                          value={item.mediaUrl}
                          onChange={(e) => handleUpdateItem(item.id, { mediaUrl: e.target.value })}
                          className="w-full rounded border border-border px-3 py-2 text-sm"
                        />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer pt-2">
                        <input
                          type="checkbox"
                          checked={item.isVideo}
                          onChange={(e) => handleUpdateItem(item.id, { isVideo: e.target.checked })}
                          className="rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-foreground">This media is a video</span>
                      </label>
                    </>
                  )
                })()}
              </div>
            ) : (
              <div className="bg-secondary/20 border border-dashed border-border rounded-lg p-12 text-center">
                <p className="text-sm text-muted-foreground">Select an item to edit its details</p>
              </div>
            )}
          </div>
        </div>

        {hasChanges && (
          <div className="mt-10 flex gap-3 fixed bottom-8 right-8">
            <button
              onClick={() => setHasChanges(false)}
              className="px-4 py-2.5 rounded-lg border border-border text-foreground text-sm font-semibold hover:bg-secondary transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Save size={16} />
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
