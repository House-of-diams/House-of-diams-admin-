'use client'

import { useState } from 'react'
import { Search, Plus, Calendar, Trash2 } from 'lucide-react'

interface CRMInteraction {
  id: number
  customer: string
  type: 'call' | 'email' | 'note' | 'meeting'
  subject: string
  date: string
  notes: string
  status: 'completed' | 'pending' | 'follow-up'
}

export default function CRMPage() {
  const [search, setSearch] = useState('')
  const [interactions, setInteractions] = useState<CRMInteraction[]>([
    {
      id: 1,
      customer: 'Sarah Mitchell',
      type: 'email',
      subject: 'Custom design inquiry',
      date: '2024-01-15',
      notes: 'Customer interested in bespoke ring design, follow up with design options',
      status: 'pending',
    },
    {
      id: 2,
      customer: 'James Chen',
      type: 'call',
      subject: 'Post-purchase support',
      date: '2024-01-14',
      notes: 'Discussed jewelry care and warranty details. Customer satisfied.',
      status: 'completed',
    },
    {
      id: 3,
      customer: 'Aisha Patel',
      type: 'meeting',
      subject: 'VIP customer visit',
      date: '2024-01-12',
      notes: 'Showed new collection, discussed exclusive pieces for seasonal launch',
      status: 'completed',
    },
    {
      id: 4,
      customer: 'Marcus Johnson',
      type: 'note',
      subject: 'Gift ideas for anniversary',
      date: '2024-01-10',
      notes: 'Customer mentioned upcoming anniversary, create personalized recommendations',
      status: 'pending',
    },
  ])

  const [newInteraction, setNewInteraction] = useState<Omit<CRMInteraction, 'id'>>({
    customer: '',
    type: 'email',
    subject: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'pending',
  })

  const addInteraction = () => {
    if (newInteraction.customer && newInteraction.subject) {
      setInteractions([
        ...interactions,
        { ...newInteraction, id: Date.now() },
      ])
      setNewInteraction({
        customer: '',
        type: 'email',
        subject: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        status: 'pending',
      })
    }
  }

  const deleteInteraction = (id: number) => {
    setInteractions(interactions.filter((i) => i.id !== id))
  }

  const filteredInteractions = interactions.filter((i) =>
    i.customer.toLowerCase().includes(search.toLowerCase()) ||
    i.subject.toLowerCase().includes(search.toLowerCase())
  )

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'call':
        return '📞'
      case 'email':
        return '📧'
      case 'meeting':
        return '🤝'
      case 'note':
        return '📝'
      default:
        return '💬'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700'
      case 'pending':
        return 'bg-yellow-100 text-yellow-700'
      case 'follow-up':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="p-8">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-jakarta text-3xl font-semibold text-foreground">CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage customer relationships and interactions</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors duration-200">
          <Plus size={18} />
          Log Interaction
        </button>
      </div>

      {/* Add Interaction Form */}
      <div className="mb-8 rounded-lg border border-border bg-white p-6 shadow-xs">
        <h2 className="font-jakarta text-lg font-semibold text-foreground mb-6">Log New Interaction</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Customer *
              </label>
              <input
                type="text"
                value={newInteraction.customer}
                onChange={(e) =>
                  setNewInteraction({ ...newInteraction, customer: e.target.value })
                }
                placeholder="Select or type customer name"
                className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Type</label>
              <select
                value={newInteraction.type}
                onChange={(e) =>
                  setNewInteraction({
                    ...newInteraction,
                    type: e.target.value as CRMInteraction['type'],
                  })
                }
                className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="note">Note</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Subject *</label>
            <input
              type="text"
              value={newInteraction.subject}
              onChange={(e) =>
                setNewInteraction({ ...newInteraction, subject: e.target.value })
              }
              placeholder="Interaction subject"
              className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Date</label>
              <input
                type="date"
                value={newInteraction.date}
                onChange={(e) =>
                  setNewInteraction({ ...newInteraction, date: e.target.value })
                }
                className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Status</label>
              <select
                value={newInteraction.status}
                onChange={(e) =>
                  setNewInteraction({
                    ...newInteraction,
                    status: e.target.value as CRMInteraction['status'],
                  })
                }
                className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="follow-up">Follow-up</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Notes</label>
            <textarea
              value={newInteraction.notes}
              onChange={(e) =>
                setNewInteraction({ ...newInteraction, notes: e.target.value })
              }
              placeholder="Interaction details and notes..."
              rows={3}
              className="w-full rounded border border-border bg-white px-4 py-2 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            type="button"
            onClick={addInteraction}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            Log Interaction
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search interactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-border bg-white py-2 pl-10 pr-4 text-sm transition-colors hover:border-input focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Interactions List */}
      <div className="space-y-3">
        {filteredInteractions.map((interaction) => (
          <div
            key={interaction.id}
            className="rounded-lg border border-border bg-card p-6 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{getTypeIcon(interaction.type)}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {interaction.customer}
                    </p>
                    <p className="text-xs text-muted-foreground">{interaction.type.toUpperCase()}</p>
                  </div>
                </div>
                <p className="text-sm font-medium text-foreground mb-2">{interaction.subject}</p>
                <p className="text-sm text-muted-foreground mb-3">{interaction.notes}</p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar size={12} />
                    {interaction.date}
                  </div>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(interaction.status)}`}
                  >
                    {interaction.status.charAt(0).toUpperCase() + interaction.status.slice(1)}
                  </span>
                </div>
              </div>
              <button
                onClick={() => deleteInteraction(interaction.id)}
                className="rounded p-1.5 hover:bg-red-100 transition-colors flex-shrink-0"
              >
                <Trash2 size={18} className="text-red-600" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredInteractions.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">No interactions found.</p>
        </div>
      )}
    </div>
  )
}
