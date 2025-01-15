'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface Channel {
  id: string
  name: string
  type: 'PUBLIC' | 'PRIVATE' | 'DM'
  description: string | null
  workspaceId: string
  createdAt: Date
  updatedAt: Date
}

interface WorkspaceMember {
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

interface Workspace {
  id: string
  name: string
  description: string | null
  logo: string | null
  createdAt: Date
  updatedAt: Date
}

interface WorkspaceContextType {
  workspace: WorkspaceWithDetails
  userId: string
  selectedChannelId: string | null
  setSelectedChannelId: (id: string | null) => void
  userStatuses: { [userId: string]: string }
  updateUserStatus: (userId: string, status: string) => void
  updateWorkspaceChannels: (channels: Channel[]) => void
}

interface WorkspaceWithDetails extends Workspace {
  members: WorkspaceMember[]
  channels: Channel[]
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}

interface WorkspaceProviderProps {
  workspace: WorkspaceWithDetails
  userId: string
  children: React.ReactNode
}

export function WorkspaceProvider({ 
  workspace: initialWorkspace, 
  userId,
  children 
}: WorkspaceProviderProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    workspace.channels[0]?.id || null
  )

  // Initialize user statuses with localStorage if available
  const [userStatuses, setUserStatuses] = useState<{ [userId: string]: string }>(() => {
    if (typeof window !== 'undefined') {
      const savedStatuses = localStorage.getItem(`workspace_${workspace.id}_statuses`)
      if (savedStatuses) {
        return JSON.parse(savedStatuses)
      }
    }
    // Default all users to Active if no saved statuses
    const initialStatuses: { [userId: string]: string } = {}
    workspace.members.forEach(member => {
      if (member.user?.id) {
        initialStatuses[member.user.id] = 'Active'
      }
    })
    return initialStatuses
  })

  // Set up SSE connection for workspace events
  useEffect(() => {
    const eventSource = new EventSource(`/api/workspaces/${workspace.id}/events`)

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'CHANNEL_CREATED':
          setWorkspace(prev => ({
            ...prev,
            channels: [...prev.channels, data.channel]
          }))
          break

        case 'CHANNEL_UPDATED':
          setWorkspace(prev => ({
            ...prev,
            channels: prev.channels.map(c => 
              c.id === data.channel.id ? data.channel : c
            )
          }))
          break

        case 'CHANNEL_DELETED':
          setWorkspace(prev => ({
            ...prev,
            channels: prev.channels.filter(c => c.id !== data.channelId)
          }))
          // If user was in the deleted channel, switch to #general
          if (selectedChannelId === data.channelId) {
            setSelectedChannelId(data.generalChannelId)
          }
          break
      }
    }

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error)
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [workspace.id, selectedChannelId])

  // Update localStorage when statuses change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`workspace_${workspace.id}_statuses`, JSON.stringify(userStatuses))
    }
  }, [userStatuses, workspace.id])

  // Poll for status updates
  useEffect(() => {
    const pollStatuses = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/status`)
        if (res.ok) {
          const data = await res.json()
          setUserStatuses(data)
        }
      } catch (error) {
        console.error('Error polling user statuses:', error)
      }
    }

    // Poll every 5 seconds
    const interval = setInterval(pollStatuses, 5000)
    pollStatuses() // Initial poll

    return () => clearInterval(interval)
  }, [workspace.id])

  const updateUserStatus = useCallback(async (userId: string, status: string) => {
    if (!userId) return

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, status }),
      })

      if (res.ok) {
        const data = await res.json()
        setUserStatuses(prev => ({
          ...prev,
          [userId]: status
        }))
      }
    } catch (error) {
      console.error('Error updating user status:', error)
    }
  }, [workspace.id])

  const updateWorkspaceChannels = useCallback((channels: Channel[]) => {
    setWorkspace(prev => ({
      ...prev,
      channels
    }))
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        userId,
        selectedChannelId,
        setSelectedChannelId,
        userStatuses,
        updateUserStatus,
        updateWorkspaceChannels,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
} 