'use client'

import { useWorkspace } from './workspace-provider'
import { Sidebar } from '@/app/components/Sidebar'
import { TopBar } from '@/app/components/TopBar'
import { MessageArea } from '@/app/components/MessageArea'
import { useRouter, useParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

export default function WorkspacePage() {
  const router = useRouter()
  const params = useParams()
  const { data: session, status } = useSession()
  const { workspace, selectedChannelId, setSelectedChannelId } = useWorkspace()
  const cleanupRef = useRef<(() => void)[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [workspaceMembers, setWorkspaceMembers] = useState<Array<{
    user: {
      id: string
      name: string | null
      image: string | null
    }
  }>>([])
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  // Find the general channel or use the first channel as fallback
  const generalChannel = workspace.channels.find(channel => channel.name === 'general')
  const defaultChannel = generalChannel || workspace.channels[0]
  const selectedChannel = workspace.channels.find(
    channel => channel.id === selectedChannelId?.toString()
  )

  useEffect(() => {
    async function fetchWorkspaceMembers() {
      try {
        const res = await fetch(`/api/workspaces/${workspace.id}/members`)
        if (!res.ok) {
          throw new Error('Failed to fetch workspace members')
        }
        const data = await res.json()
        setWorkspaceMembers(data)
      } catch (error) {
        console.error('Error fetching workspace members:', error)
      }
    }

    if (status === 'authenticated') {
      fetchWorkspaceMembers()
    }
  }, [workspace.id, status])

  // Run cleanup when session changes or component unmounts
  useEffect(() => {
    if (status === 'unauthenticated') {
      cleanupRef.current.forEach(cleanup => cleanup())
      cleanupRef.current = []
    }
  }, [status])

  useEffect(() => {
    // If no channel is selected, select the default channel
    if (!selectedChannelId && defaultChannel) {
      setSelectedChannelId(defaultChannel.id)
    }

    // Cleanup function that will be called when navigating away
    return () => {
      // Call all cleanup functions
      cleanupRef.current.forEach(cleanup => cleanup())
      // Clear the cleanup array
      cleanupRef.current = []
    }
  }, [selectedChannelId, defaultChannel, setSelectedChannelId])

  // Clear initial load flag after first render
  useEffect(() => {
    if (isInitialLoad && selectedChannelId) {
      setIsInitialLoad(false)
    }
  }, [selectedChannelId, isInitialLoad])

  const registerCleanup = (cleanup: () => void) => {
    cleanupRef.current.push(cleanup)
  }

  const handleChannelSelect = async (channel: { id: string; name: string }) => {
    // Validate that the channel exists before selecting
    const targetChannel = workspace.channels.find(c => c.id === channel.id)
    if (targetChannel) {
      setSelectedChannelId(targetChannel.id)
    } else {
      // If channel doesn't exist, select default channel
      setSelectedChannelId(defaultChannel.id)
    }
  }

  const handleDirectMessageSelect = async (dm: { id: string; name: string }) => {
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/dm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: dm.id,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        console.error('Failed to handle DM:', error)
        return
      }

      const channel = await res.json()
      setSelectedChannelId(channel.id)
      
      // Add the channel to workspace.channels if it's not already there
      if (!workspace.channels.find(c => c.id === channel.id)) {
        workspace.channels = [...workspace.channels, channel]
      }
    } catch (error) {
      console.error('Error handling DM:', error)
    }
  }

  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width)
  }

  // If not authenticated, don't render anything
  if (status === 'unauthenticated') {
    return null
  }

  // Filter out the current user from the direct messages list and DM channels from the channel list
  const directMessages = workspaceMembers
    .filter(member => member.user.id !== session?.user?.id)
    .map(member => ({
      id: member.user.id,
      name: member.user.name || 'Unknown User',
      image: member.user.image
    }))

  const regularChannels = workspace.channels
    .filter(channel => channel.type !== 'DM')
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type === 'DM' ? 'dm' : 'channel'
    }))

  // Helper function to get DM user's name
  const getDMUserName = (channelName: string) => {
    if (!channelName.startsWith('DM:')) return channelName
    
    const otherUserId = channelName
      .split(':')[1]
      .split('-')
      .find(id => id !== session?.user?.id)
    
    if (!otherUserId) return channelName

    const otherUser = workspaceMembers.find(member => member.user.id === otherUserId)
    return otherUser?.user.name || 'Unknown User'
  }

  return (
    <>
      <Sidebar
        workspace={{
          name: workspace.name,
          logo: workspace.logo
        }}
        channels={regularChannels}
        directMessages={directMessages}
        onChannelSelect={handleChannelSelect}
        onDirectMessageSelect={handleDirectMessageSelect}
        selectedChannelId={selectedChannelId}
        width={sidebarWidth}
        onResize={handleSidebarResize}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          channelName={selectedChannel?.type === 'DM' ? 
            getDMUserName(selectedChannel.name) : 
            selectedChannel?.name}
          channelType={selectedChannel?.type === 'DM' ? 'dm' : 'channel'}
          onThemeChange={() => {}} // We'll implement this later
        />
        <MessageArea
          channelId={selectedChannel?.id}
          channelName={selectedChannel?.type === 'DM' ? 
            getDMUserName(selectedChannel.name) : 
            selectedChannel?.name}
          channelType={selectedChannel?.type === 'DM' ? 'dm' : 'channel'}
          messages={[]} // Initial messages will be fetched by the component
          onSendMessage={() => {}} // Handled internally by MessageArea now
          onAddReaction={() => {}} // Handled internally by MessageArea now
          registerCleanup={registerCleanup}
          shouldScrollOnLoad={isInitialLoad}
        />
      </div>
    </>
  )
} 