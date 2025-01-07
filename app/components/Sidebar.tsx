'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { PlusCircle, Hash, User, ChevronDown, ChevronRight, Settings, Building } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

interface Channel {
  id: string
  name: string
  type: string
}

interface DirectMessage {
  id: string
  name: string
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
}

export function Sidebar({ 
  workspace,
  channels, 
  directMessages, 
  onChannelSelect, 
  onDirectMessageSelect, 
  selectedChannelId,
  width,
  onResize
}: SidebarProps) {
  const { data: session } = useSession()
  const [isChannelsSectionCollapsed, setIsChannelsSectionCollapsed] = useState(false)
  const [isDmSectionCollapsed, setIsDmSectionCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [currentWidth, setCurrentWidth] = useState(width)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [userStatus, setUserStatus] = useState('Active')
  const [customStatus, setCustomStatus] = useState('')
  const router = useRouter()

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

  const handleStatusChange = useCallback((newStatus: string) => {
    setUserStatus(newStatus)
  }, [])

  const handleCustomStatusChange = useCallback((newStatus: string) => {
    setCustomStatus(newStatus)
    if (newStatus.trim()) {
      setUserStatus(newStatus)
    } else {
      setUserStatus('Active')
    }
  }, [])

  const toggleAwayStatus = useCallback(() => {
    if (userStatus === 'Away') {
      setUserStatus(customStatus.trim() || 'Active')
    } else {
      setUserStatus('Away')
    }
  }, [userStatus, customStatus])

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

  return (
    <div 
      ref={sidebarRef}
      className="bg-gray-800 text-white p-4 flex flex-col relative flex-shrink-0 h-full"
      style={{ width: `${width}px` }}
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
      <div className="mb-4">
        <Input type="text" placeholder="Search" className="w-full bg-gray-700" />
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
          <Button variant="ghost" size="sm" className="ml-auto flex-shrink-0">
            <PlusCircle className="h-4 w-4" />
          </Button>
        </h2>
        {!isChannelsSectionCollapsed && (
          <ul className="w-full">
            {channels.map((channel) => (
              <li 
                key={channel.id} 
                className={`mb-1 flex items-center cursor-pointer hover:bg-gray-700 rounded px-2 py-1 ${
                  selectedChannelId === channel.id ? 'bg-gray-700' : ''
                }`}
                onClick={() => handleChannelClick(channel)}
              >
                <Hash className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate min-w-0">
                  {truncateText(channel.name, currentWidth - 60)}
                </span>
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
    </div>
  )
}

