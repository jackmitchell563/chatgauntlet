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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Array<any>>([])
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false)

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
    // Clear search state first
    setSearchQuery('')
    
    // Clear messages before switching channels
    setMessages([])
    setIsLoadingMessages(true)
    setShouldScrollToBottom(true)  // Set to true when switching channels
    
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
    // Clear search state first
    setSearchQuery('')
    
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
      
      // First update the workspace channels if needed
      if (!workspace.channels.find(c => c.id === channel.id)) {
        workspace.channels = [...workspace.channels, channel]
      }
      
      // Then set the selected channel ID
      setSelectedChannelId(channel.id)
      
      // Force a message fetch by clearing messages
      setMessages([])
      setIsLoadingMessages(true)
      
      // Fetch messages for the new DM channel
      try {
        const messagesRes = await fetch(`/api/channels/${channel.id}/messages`)
        if (messagesRes.ok) {
          const data = await messagesRes.json()
          setMessages(data)
        }
      } catch (error) {
        console.error('Error fetching DM messages:', error)
      } finally {
        setIsLoadingMessages(false)
      }
    } catch (error) {
      console.error('Error handling DM:', error)
    }
  }

  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width)
  }

  const handleSearchResultClick = (messageId: string) => {
    console.log('WorkspacePage: Search result clicked', {
      messageId,
      selectedChannelId,
      searchQuery,
      currentMessageId: selectedMessageId
    })

    // First set the message ID to trigger the scroll
    setSelectedMessageId(messageId)

    // Clear search query after a short delay to allow MessageArea to find the message
    setTimeout(() => {
      setSearchQuery('')
    }, 100)
  }

  const handleShowFullSearch = (query: string) => {
    console.log('WorkspacePage: Showing full search for query:', query)
    setSearchQuery(query)
  }

  const handleSendMessage = async (content: string) => {
    if (!selectedChannelId) return
    
    try {
      const res = await fetch(`/api/channels/${selectedChannelId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        throw new Error('Failed to send message')
      }
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleAddReaction = async (messageId: string, emoji: { native: string }) => {
    try {
      const res = await fetch(`/api/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          emoji: emoji.native,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to add reaction')
      }
    } catch (error) {
      console.error('Error adding reaction:', error)
    }
  }

  // Add effect to fetch messages when channel changes
  useEffect(() => {
    async function fetchMessages() {
      if (!selectedChannelId || status !== 'authenticated') return
      
      setIsLoadingMessages(true)
      try {
        const res = await fetch(`/api/channels/${selectedChannelId}/messages`)
        if (!res.ok) {
          throw new Error('Failed to fetch messages')
        }
        const data = await res.json()
        setMessages(data)
      } catch (error) {
        console.error('Error fetching messages:', error)
      } finally {
        setIsLoadingMessages(false)
        setShouldScrollToBottom(false)  // Reset after messages are loaded
      }
    }

    fetchMessages()
    
    // Set up polling
    const interval = setInterval(fetchMessages, 1000)
    return () => clearInterval(interval)
  }, [selectedChannelId, status])

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
      type: 'channel' as const
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
        onSearchResultClick={handleSearchResultClick}
        onShowFullSearch={handleShowFullSearch}
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
          key={selectedChannelId}
          channelId={selectedChannel?.id}
          channelName={selectedChannel?.type === 'DM' ? 
            getDMUserName(selectedChannel.name) : 
            selectedChannel?.name}
          channelType={selectedChannel?.type === 'DM' ? 'dm' : 'channel'}
          messages={messages}
          onSendMessage={handleSendMessage}
          onAddReaction={handleAddReaction}
          registerCleanup={registerCleanup}
          shouldScrollOnLoad={isInitialLoad}
          shouldScrollToBottom={shouldScrollToBottom}
          searchQuery={searchQuery}
          onSearchResultClick={handleSearchResultClick}
          selectedMessageId={selectedMessageId}
        />
      </div>
    </>
  )
} 