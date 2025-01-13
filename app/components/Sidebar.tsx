'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { PlusCircle, Hash, User, ChevronDown, ChevronRight, Settings, Building, Search, MoreVertical } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useWorkspace } from '@/app/workspace/[workspaceId]/workspace-provider'
import { SearchResults } from './SearchResults'
import { useDebounce } from '@/app/hooks/useDebounce'
import { CreateChannelDialog } from './CreateChannelDialog'
import { EditChannelDialog } from './EditChannelDialog'

interface Channel {
  id: string
  name: string
  type: 'PUBLIC' | 'PRIVATE' | 'DM' | 'channel' | 'dm'
  description?: string | null
  workspaceId?: string
  createdAt?: Date
  updatedAt?: Date
}

interface DirectMessage {
  id: string
  name: string
}

interface SearchResult {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string | null
    image: string | null
  }
  reactions: {
    id: string
    emoji: string
    user: {
      id: string
      name: string | null
    }
  }[]
  thread?: {
    id: string
    messageCount: number
  }
}

interface SidebarProps {
  workspace: {
    name: string
    logo?: string | null
  }
  channels: Channel[]
  directMessages: DirectMessage[]
  onChannelSelect: (channel: Channel) => void
  onDirectMessageSelect: (dm: DirectMessage) => void
  selectedChannelId: string | null
  width: number
  onResize: (width: number) => void
  onSearchResultClick: (messageId: string) => void
  onShowFullSearch: (query: string) => void
  backgroundColor?: string
}

export function Sidebar({ 
  workspace,
  channels, 
  directMessages, 
  onChannelSelect, 
  onDirectMessageSelect, 
  selectedChannelId,
  width,
  onResize,
  onSearchResultClick,
  onShowFullSearch,
  backgroundColor
}: SidebarProps) {
  const { data: session } = useSession()
  const { userStatuses, updateUserStatus, updateWorkspaceChannels } = useWorkspace()
  const [isChannelsSectionCollapsed, setIsChannelsSectionCollapsed] = useState(false)
  const [isDmSectionCollapsed, setIsDmSectionCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [customStatus, setCustomStatus] = useState('')
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false)
  const [editingChannel, setEditingChannel] = useState<{ id: string; name: string } | null>(null)
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  const userStatus = session?.user?.id ? userStatuses[session.user.id] || 'Active' : 'Active'

  const handleStatusChange = useCallback((newStatus: string) => {
    if (session?.user?.id) {
      updateUserStatus(session.user.id, newStatus)
    }
  }, [session?.user?.id, updateUserStatus])

  const handleCustomStatusChange = useCallback((newStatus: string) => {
    setCustomStatus(newStatus)
    if (session?.user?.id) {
      updateUserStatus(session.user.id, newStatus.trim() || 'Active')
    }
  }, [session?.user?.id, updateUserStatus])

  const toggleAwayStatus = useCallback(() => {
    if (!session?.user?.id) return
    
    if (userStatus === 'Away') {
      updateUserStatus(session.user.id, customStatus.trim() || 'Active')
    } else {
      updateUserStatus(session.user.id, 'Away')
    }
  }, [userStatus, customStatus, session?.user?.id, updateUserStatus])

  const handleChannelClick = (channel: Channel) => {
    onChannelSelect(channel)
  }

  const toggleChannelsSection = () => {
    setIsChannelsSectionCollapsed(!isChannelsSectionCollapsed)
  }

  const toggleDmSection = () => {
    setIsDmSectionCollapsed(!isDmSectionCollapsed)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const truncateText = (text: string, maxWidth: number) => {
    const charWidth = 8; // Approximate width of a character in pixels
    const maxChars = Math.floor(maxWidth / charWidth);
    return text.length > maxChars ? text.slice(0, maxChars - 3) + '...' : text;
  };

  const handleSwitchWorkspaces = () => {
    router.push('/workspaces')
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = e.clientX
      if (newWidth >= 200 && newWidth <= 400) {
        onResize(newWidth)
        setCurrentWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, onResize])

  // Search effect
  useEffect(() => {
    async function performSearch() {
      if (!selectedChannelId || !debouncedSearchQuery.trim()) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/channels/${selectedChannelId}/search?` + 
          new URLSearchParams({
            query: debouncedSearchQuery,
            limit: '5'
          })
        )
        if (res.ok) {
          const data = await res.json()
          setSearchResults(data)
        }
      } catch (error) {
        console.error('Error searching messages:', error)
      } finally {
        setIsSearching(false)
      }
    }

    performSearch()
  }, [debouncedSearchQuery, selectedChannelId])

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      onShowFullSearch(searchQuery)
      setSearchQuery('')
      setSearchResults([])
    }
  }

  const handleSearchResultClick = (messageId: string) => {
    console.log('Sidebar: Search result clicked', {
      messageId,
      selectedChannelId,
      hasOnResultClick: !!onSearchResultClick
    })
    
    // First, clear the search query and results
    setSearchQuery('')
    setSearchResults([])
    console.log('Sidebar: Cleared search state')
    
    // Then notify parent of the click
    if (onSearchResultClick) {
      console.log('Sidebar: Calling parent onSearchResultClick')
      onSearchResultClick(messageId)
      console.log('Sidebar: Parent onSearchResultClick completed')
    }
  }

  const handleCreateChannel = (channel: any) => {
    // Add the new channel to the list
    onChannelSelect({
      id: channel.id,
      name: channel.name,
      type: channel.type || 'PUBLIC',
      ...(channel.description && { description: channel.description }),
      ...(channel.workspaceId && { workspaceId: channel.workspaceId }),
      ...(channel.createdAt && { createdAt: new Date(channel.createdAt) }),
      ...(channel.updatedAt && { updatedAt: new Date(channel.updatedAt) })
    })
  }

  const handleChannelDelete = async (channelId: string) => {
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to delete channel')
      }

      // Find the general channel
      const generalChannel = channels.find(c => c.name === 'general')
      if (!generalChannel) return

      // If the deleted channel was selected, switch to #general
      if (channelId === selectedChannelId) {
        onChannelSelect(generalChannel)
      }

      // Update the channels list with correct types and ensure optional fields are not undefined
      const updatedChannels = channels
        .filter(c => c.id !== channelId)
        .map(c => ({
          ...c,
          type: c.type === 'channel' ? 'PUBLIC' : c.type === 'dm' ? 'DM' : c.type,
          description: c.description || null,
          workspaceId: c.workspaceId || '',
          createdAt: c.createdAt || new Date(),
          updatedAt: c.updatedAt || new Date()
        }))
      updateWorkspaceChannels(updatedChannels)
    } catch (error) {
      console.error('Error deleting channel:', error)
    }
  }

  const handleChannelUpdate = (updatedChannel: any) => {
    const updatedChannels = channels.map(c => 
      c.id === updatedChannel.id ? {
        ...c,
        name: updatedChannel.name,
        type: c.type === 'channel' ? 'PUBLIC' : c.type === 'dm' ? 'DM' : c.type,
        description: updatedChannel.description || null,
        workspaceId: c.workspaceId || '',
        createdAt: c.createdAt || new Date(),
        updatedAt: new Date(updatedChannel.updatedAt || Date.now())
      } : {
        ...c,
        type: c.type === 'channel' ? 'PUBLIC' : c.type === 'dm' ? 'DM' : c.type,
        description: c.description || null,
        workspaceId: c.workspaceId || '',
        createdAt: c.createdAt || new Date(),
        updatedAt: c.updatedAt || new Date()
      }
    )
    updateWorkspaceChannels(updatedChannels)
  }

  return (
    <div 
      ref={sidebarRef}
      className="bg-gray-800 text-white p-4 flex flex-col relative flex-shrink-0 h-full"
      style={{ width: `${width}px`, backgroundColor: backgroundColor }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 mb-4 w-full hover:bg-gray-700 h-auto py-2 px-3 text-white hover:text-white"
          >
            {workspace.logo ? (
              <Image
                src={workspace.logo}
                alt={`${workspace.name} logo`}
                width={24}
                height={24}
                className="rounded flex-shrink-0"
              />
            ) : (
              <Building className="h-6 w-6 text-gray-400 flex-shrink-0" />
            )}
            <h1 className="text-xl font-bold truncate text-left">
              {truncateText(workspace.name, currentWidth - 64)}
            </h1>
            <ChevronDown className="h-4 w-4 ml-auto flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          <DropdownMenuItem onClick={handleSwitchWorkspaces}>
            Switch workspaces
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input 
          type="text" 
          placeholder="Search" 
          className="w-full bg-gray-700 pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {(searchResults.length > 0 || isSearching) && searchQuery && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border max-h-96 overflow-y-auto">
            {isSearching ? (
              <div className="p-4 text-center text-gray-500">
                Searching...
              </div>
            ) : (
              <SearchResults
                results={searchResults}
                onResultClick={handleSearchResultClick}
              />
            )}
          </div>
        )}
      </div>
      <div className="mb-4">
        <h2 
          className="text-lg font-semibold mb-2 flex items-center cursor-pointer"
          onClick={toggleChannelsSection}
        >
          {isChannelsSectionCollapsed ? (
            <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0" />
          )}
          <span className="truncate">Channels</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              setIsCreateChannelOpen(true)
            }}
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
        </h2>
        {!isChannelsSectionCollapsed && (
          <ul className="w-full">
            {channels.map((channel) => (
              <li 
                key={channel.id} 
                className={`mb-1 flex items-center cursor-pointer hover:bg-gray-700 rounded px-2 py-1 group ${
                  selectedChannelId === channel.id ? 'bg-gray-700' : ''
                }`}
                onClick={() => handleChannelClick(channel)}
              >
                <Hash className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate min-w-0">
                  {truncateText(channel.name, currentWidth - 60)}
                </span>
                {channel.name !== 'general' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto p-0 h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation()
                        setEditingChannel(channel)
                      }}>
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleChannelDelete(channel.id)
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h2 
          className="text-lg font-semibold mb-2 flex items-center cursor-pointer"
          onClick={toggleDmSection}
        >
          {isDmSectionCollapsed ? (
            <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0" />
          )}
          <span className="truncate">Direct Messages</span>
          <Button variant="ghost" size="sm" className="ml-auto flex-shrink-0">
            <PlusCircle className="h-4 w-4" />
          </Button>
        </h2>
        {!isDmSectionCollapsed && (
          <ul className="w-full">
            {directMessages.map((dm) => (
              <li 
                key={dm.id} 
                className={`mb-1 flex items-center cursor-pointer hover:bg-gray-700 rounded px-2 py-1 ${
                  selectedChannelId === dm.id ? 'bg-gray-700' : ''
                }`}
                onClick={() => onDirectMessageSelect(dm)}
              >
                <User className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate min-w-0">
                  {truncateText(dm.name, currentWidth - 60)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div className="flex items-center p-2 cursor-pointer hover:bg-gray-700 rounded">
              <div className="relative flex-shrink-0">
                <UserAvatar 
                  src={session?.user?.image || undefined}
                  alt={session?.user?.name || 'User'} 
                  size={32} 
                />
                <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                  userStatus === 'Away' ? 'bg-transparent border-gray-400' : 'bg-green-500'
                }`} />
              </div>
              <div className="flex-grow ml-4 min-w-0">
                <div className="font-semibold truncate">
                  {truncateText(session?.user?.name || 'User', currentWidth - 84)}
                </div>
                <div className="text-sm text-gray-400 truncate">
                  {truncateText(userStatus, currentWidth - 84)}
                </div>
              </div>
              <Settings className="h-4 w-4 flex-shrink-0" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="p-2">
              <Input
                type="text"
                placeholder="Set a custom status..."
                value={customStatus}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCustomStatusChange(e.target.value)}
                className="mb-2"
              />
            </div>
            <DropdownMenuItem onSelect={toggleAwayStatus}>
              Set status: {userStatus === 'Away' ? 'Active' : 'Away'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-gray-600 transition-colors"
        onMouseDown={handleMouseDown}
      />
      <CreateChannelDialog
        isOpen={isCreateChannelOpen}
        onClose={() => setIsCreateChannelOpen(false)}
        onChannelCreated={handleCreateChannel}
      />

      {editingChannel && (
        <EditChannelDialog
          isOpen={true}
          onClose={() => setEditingChannel(null)}
          onChannelUpdated={handleChannelUpdate}
          channel={editingChannel}
        />
      )}
    </div>
  )
}

