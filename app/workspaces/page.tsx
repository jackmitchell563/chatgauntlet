'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { PlusCircle } from 'lucide-react'
import { JoinWorkspaceDialog } from '../components/JoinWorkspaceDialog'

interface Workspace {
  id: string
  name: string
  description?: string | null
  logo?: string | null
  members: { role: string }[]
  _count: { members: number }
}

export default function WorkspacesPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newWorkspaceDescription, setNewWorkspaceDescription] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const res = await fetch('/api/workspaces')
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch workspaces')
        }
        const data = await res.json()
        setWorkspaces(data)
      } catch (err) {
        console.error('Error fetching workspaces:', err)
        setError(err instanceof Error ? err.message : 'Failed to load workspaces')
      } finally {
        setIsLoading(false)
      }
    }

    if (status === 'authenticated' && session?.user) {
      fetchWorkspaces()
    } else if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, session, router])

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newWorkspaceName,
          description: newWorkspaceDescription || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create workspace')
      }

      const workspace = await res.json()
      setWorkspaces(prev => [...prev, workspace])
      setNewWorkspaceName('')
      setNewWorkspaceDescription('')
      setShowCreateModal(false)
    } catch (err) {
      console.error('Error creating workspace:', err)
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (status === 'loading' || (status === 'authenticated' && isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null // Router will handle redirect
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Workspaces</h1>
          <p className="mt-2 text-gray-600">Select a workspace or create a new one</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">
            {error}
          </div>
        )}

        <JoinWorkspaceDialog onCreateWorkspaceClick={() => setShowCreateModal(true)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-8">
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => router.push(`/workspace/${workspace.id}`)}
              className="bg-white p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 text-left"
            >
              <h3 className="text-lg font-semibold text-gray-900">{workspace.name}</h3>
              {workspace.description && (
                <p className="mt-2 text-gray-500 text-sm">{workspace.description}</p>
              )}
              <div className="mt-4 flex items-center text-sm text-gray-500">
                <span>{workspace._count.members} members</span>
                <span className="mx-2">•</span>
                <span>You are {workspace.members[0].role.toLowerCase()}</span>
              </div>
            </button>
          ))}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Create New Workspace</h2>
              <form onSubmit={handleCreateWorkspace}>
                <div className="mb-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description (optional)
                  </label>
                  <textarea
                    id="description"
                    value={newWorkspaceDescription}
                    onChange={(e) => setNewWorkspaceDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 rounded-md disabled:opacity-50"
                  >
                    {isSubmitting ? 'Creating...' : 'Create Workspace'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 