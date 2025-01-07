'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Send, Paperclip, MessageSquare } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { useSession } from 'next-auth/react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import Image from 'next/image'
import { useWorkspace } from '@/app/workspace/[workspaceId]/workspace-provider'
import { ThreadView } from './ThreadView'

// Create a global flag for message polling
let isPollingEnabled = true

interface Message {
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
  parentMessageId?: string | null
  attachments?: {
    id: string
    name: string
    type: string
    url: string
    size: number
  }[]
}

interface ThreadState {
  rootMessage: Message
  messages: Message[]
}

interface MessageAreaProps {
  channelId: string | undefined
  channelName: string | undefined
  channelType: 'channel' | 'dm' | undefined
  messages: Message[]
  onSendMessage: (content: string) => void
  onAddReaction: (messageId: string, emoji: { native: string }) => void
  registerCleanup: (cleanup: () => void) => void
  shouldScrollOnLoad?: boolean
}

interface UserProfileProps {
  user: {
    id: string
    name: string | null
    image: string | null
  }
}

function UserProfile({ user }: UserProfileProps) {
  const { userStatuses } = useWorkspace()
  const status = userStatuses[user.id] || 'Active'
  
  return (
    <div className="p-4 w-72">
      <div className="flex items-center space-x-4">
        <UserAvatar 
          src={user.image || undefined}
          alt={user.name || 'Unknown User'} 
          size={64}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">
            {user.name || 'Unknown User'}
          </h3>
          <div className="flex items-center text-sm text-gray-500">
            <div className={`w-2 h-2 rounded-full mr-2 ${status === 'Away' ? 'bg-gray-400' : 'bg-green-500'}`}></div>
            {status}
          </div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t">
        <div className="text-sm text-gray-600">
          <div className="flex items-center mb-2">
            <MessageSquare className="w-4 h-4 mr-2" />
            Message
          </div>
        </div>
      </div>
    </div>
  )
}

export function MessageArea({ 
  channelId, 
  channelName, 
  channelType, 
  messages: initialMessages, 
  onSendMessage, 
  onAddReaction,
  registerCleanup,
  shouldScrollOnLoad = false
}: MessageAreaProps) {
  const { data: session, status } = useSession()
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [activeThread, setActiveThread] = useState<ThreadState | null>(null)
  const [threadMessages, setThreadMessages] = useState<{ [threadId: string]: Message[] }>({})
  const [openEmojiPickerId, setOpenEmojiPickerId] = useState<string | null>(null)
  const [uploadingFiles, setUploadingFiles] = useState<{ [key: string]: { progress: number; name: string } }>({})
  const [stagedAttachments, setStagedAttachments] = useState<{
    name: string;
    type: string;
    url: string;
    size: number;
  }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout>()
  const lastChannelIdRef = useRef<string | undefined>(channelId)
  const initialFetchRef = useRef(false)
  const shouldScrollRef = useRef(false)

  // Reset initial fetch flag when channel changes
  useEffect(() => {
    if (channelId !== lastChannelIdRef.current) {
      console.log('Channel changed, resetting fetch state')
      lastChannelIdRef.current = channelId
      initialFetchRef.current = false
      shouldScrollRef.current = true
      setIsLoading(false) // Reset loading state when channel changes
    }
  }, [channelId])

  // Set scroll flag when shouldScrollOnLoad changes
  useEffect(() => {
    if (shouldScrollOnLoad) {
      shouldScrollRef.current = true
      initialFetchRef.current = false
    }
  }, [shouldScrollOnLoad])

  const isNearBottom = () => {
    if (!messageContainerRef.current) return false
    const container = messageContainerRef.current
    const threshold = 150 // pixels from bottom
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight)
    return distanceFromBottom <= threshold
  }

  useEffect(() => {
    async function fetchMessages() {
      if (!channelId || status !== 'authenticated' || !globalThis.isPollingEnabled || activeThread) {
        stopPolling()
        return
      }
      
      if (!initialFetchRef.current && messages.length === 0) {
        setIsLoading(true)
      }
      setError(null)
      
      try {
        console.log('Fetching messages for channel:', channelId, 'Initial fetch:', !initialFetchRef.current)
        const res = await fetch(`/api/channels/${channelId}/messages`)
        if (!res.ok) {
          if (res.status === 401) {
            stopPolling()
            return
          }
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch messages')
        }
        const data = await res.json()
        
        // Filter out messages that are part of a thread (have a parentMessageId)
        const mainMessages = data.filter((msg: Message) => !msg.parentMessageId)
        
        // Check if we should auto-scroll
        const wasNearBottom = isNearBottom()
        const hasNewMessages = mainMessages.length > messages.length
        const lastMessage = hasNewMessages ? mainMessages[mainMessages.length - 1] : null
        const isNewMessageFromOtherUser = lastMessage && lastMessage.user.id !== session?.user?.id
        const shouldAutoScroll = (wasNearBottom && hasNewMessages && isNewMessageFromOtherUser) || 
                               (hasNewMessages && lastMessage?.user.id === session?.user?.id)
        
        setMessages(mainMessages)

        // Auto-scroll if conditions are met
        if (shouldAutoScroll) {
          requestAnimationFrame(() => {
            if (messageContainerRef.current) {
              messageContainerRef.current.scrollTo({
                top: messageContainerRef.current.scrollHeight,
                behavior: 'smooth'
              })
            }
          })
        }
        // If this was the initial fetch and we should scroll
        else if (!initialFetchRef.current && shouldScrollRef.current) {
          console.log('Initial fetch complete, scrolling to bottom')
          requestAnimationFrame(() => {
            if (messageContainerRef.current) {
              messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight
            }
          })
          shouldScrollRef.current = false
        }
        
        // Mark initial fetch as complete and clear loading state
        initialFetchRef.current = true
        setIsLoading(false)
      } catch (err) {
        console.error('Error fetching messages:', err)
        setError(err instanceof Error ? err.message : 'Failed to load messages')
        setIsLoading(false)
      }
    }

    stopPolling() // Clear any existing interval
    globalThis.isPollingEnabled = true // Reset the flag when channel changes

    if (status === 'authenticated' && !activeThread) {
      fetchMessages()
      // Set up polling interval
      pollingIntervalRef.current = setInterval(fetchMessages, 1000)
    }
    
    registerCleanup(stopPolling)
    return stopPolling
  }, [channelId, registerCleanup, status, activeThread, messages.length, session?.user?.id])

  const stopPolling = () => {
    globalThis.isPollingEnabled = false
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = undefined
    }
  }

  const handleSendMessage = async () => {
    if (status !== 'authenticated') return
    
    if ((newMessage.trim() || stagedAttachments.length > 0) && channelId) {
      try {
        const res = await fetch(`/api/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: newMessage.trim(),
            attachments: stagedAttachments,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to send message')
        }

        const message = await res.json()
        setMessages(prev => [...prev, message])
        setNewMessage('')
        setStagedAttachments([]) // Clear staged attachments after sending
        
        // Smooth scroll to bottom after sending a message
        requestAnimationFrame(() => {
          if (messageContainerRef.current) {
            messageContainerRef.current.scrollTo({
              top: messageContainerRef.current.scrollHeight,
              behavior: 'smooth'
            })
          }
        })
      } catch (err) {
        console.error('Error sending message:', err)
        setError(err instanceof Error ? err.message : 'Failed to send message')
      }
    }
  }

  const handleAddReaction = async (messageId: string, emoji: { native: string }) => {
    if (status !== 'authenticated') return
    
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
        const data = await res.json()
        throw new Error(data.error || 'Failed to add reaction')
      }

      const updatedMessage = await res.json()
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, reactions: updatedMessage.reactions }
          : msg
      ))
    } catch (err) {
      console.error('Error adding reaction:', err)
      setError(err instanceof Error ? err.message : 'Failed to add reaction')
    }
  }

  const renderReactions = (messageId: string, reactions: Message['reactions']) => {
    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
        }
      }
      acc[reaction.emoji].count++
      acc[reaction.emoji].users.push(reaction.user.name || 'Unknown User')
      return acc
    }, {} as { [key: string]: { emoji: string; count: number; users: string[] } })

    return (
      <div className="flex flex-wrap gap-1 mt-2 mb-2">
        {Object.entries(groupedReactions).map(([emoji, reaction]) => (
          <button
            key={emoji}
            className={`flex items-center space-x-1 rounded px-2 py-0.5 text-sm ${
              hoveredMessageId === messageId ? 'bg-gray-200 hover:bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={() => handleAddReaction(messageId, { native: emoji })}
            title={reaction.users.join(', ')}
          >
            <span>{reaction.emoji}</span>
            <span>{reaction.count}</span>
          </button>
        ))}
      </div>
    )
  }

  const formatMessageDate = (date: Date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Reset hours to compare just the dates
    const messageDate = new Date(date)
    messageDate.setHours(0, 0, 0, 0)
    today.setHours(0, 0, 0, 0)
    yesterday.setHours(0, 0, 0, 0)

    if (messageDate.getTime() === today.getTime()) {
      return 'TODAY'
    } else if (messageDate.getTime() === yesterday.getTime()) {
      return 'YESTERDAY'
    } else {
      return messageDate.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      })
    }
  }

  const handleOpenThread = async (messageId: string) => {
    console.log('Opening thread for message:', messageId)
    try {
      const res = await fetch(`/api/messages/${messageId}/thread`)
      if (!res.ok) {
        throw new Error('Failed to fetch thread')
      }
      const data = await res.json()
      console.log('Thread data received:', data)
      
      // Store thread messages in our thread messages state
      setThreadMessages(prev => ({
        ...prev,
        [messageId]: data.messages || []
      }))
      
      // Set the active thread for display
      setActiveThread({
        rootMessage: messages.find(m => m.id === messageId) || data.rootMessage,
        messages: data.messages || []
      })
    } catch (err) {
      console.error('Error opening thread:', err)
      setError(err instanceof Error ? err.message : 'Failed to open thread')
    }
  }

  const handleSendThreadMessage = async (content: string) => {
    if (!activeThread?.rootMessage.id) return

    try {
      const res = await fetch(`/api/messages/${activeThread.rootMessage.id}/thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })

      if (!res.ok) {
        throw new Error('Failed to send thread message')
      }

      const newThreadMessage = await res.json()
      
      // Update both the active thread and stored thread messages
      const updatedMessages = [...(threadMessages[activeThread.rootMessage.id] || []), newThreadMessage]
      setThreadMessages(prev => ({
        ...prev,
        [activeThread.rootMessage.id]: updatedMessages
      }))
      
      setActiveThread(prev => prev ? {
        ...prev,
        messages: updatedMessages
      } : null)

      // Update the thread metadata in the main message list
      setMessages(prev => prev.map(msg => 
        msg.id === activeThread.rootMessage.id
          ? {
              ...msg,
              thread: {
                id: activeThread.rootMessage.thread?.id || msg.thread?.id || '',
                messageCount: updatedMessages.length
              }
            }
          : msg
      ))
    } catch (err) {
      console.error('Error sending thread message:', err)
      setError(err instanceof Error ? err.message : 'Failed to send thread message')
    }
  }

  const handleCloseThread = () => {
    setActiveThread(null)
  }

  // Add a handler for emoji picker open state
  const handleEmojiPickerOpenChange = (messageId: string, open: boolean) => {
    setOpenEmojiPickerId(open ? messageId : null)
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || !channelId) return

    const filesArray = Array.from(files)
    for (const file of filesArray) {
      const fileId = crypto.randomUUID()
      setUploadingFiles(prev => ({
        ...prev,
        [fileId]: { progress: 0, name: file.name }
      }))

      try {
        // Get pre-signed URL
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to get upload URL')
        }

        const { uploadUrl, url } = await response.json()

        // Upload file to S3
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        })

        // Add the uploaded file to staged attachments
        setStagedAttachments(prev => [...prev, {
          name: file.name,
          type: file.type,
          url: url,
          size: file.size,
        }])

      } catch (error) {
        console.error('Error uploading file:', error)
        setError('Failed to upload file')
      } finally {
        setUploadingFiles(prev => {
          const newState = { ...prev }
          delete newState[fileId]
          return newState
        })
      }
    }

    // Clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Add function to remove staged attachments
  const removeStagedAttachment = (index: number) => {
    setStagedAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const renderAttachment = (attachment: NonNullable<Message['attachments']>[number]) => {
    const isImage = attachment.type.startsWith('image/')
    
    return (
      <div key={attachment.id} className="mt-2">
        {isImage ? (
          <div className="relative rounded-lg overflow-hidden max-w-lg">
            <Image
              src={attachment.url}
              alt={attachment.name}
              width={512}
              height={384}
              className="object-contain w-full h-auto"
              style={{ maxHeight: '384px' }}
            />
          </div>
        ) : (
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center p-2 space-x-2 border rounded-lg hover:bg-gray-50 transition-colors max-w-sm"
          >
            <Paperclip className="w-4 h-4 text-gray-500" />
            <span className="flex-1 truncate">{attachment.name}</span>
            <span className="text-sm text-gray-500">
              {(attachment.size / 1024).toFixed(1)}KB
            </span>
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden">
      <div className={`flex flex-1 min-h-0 ${activeThread ? 'divide-x' : ''}`}>
        <div 
          className={`
            flex-1 overflow-y-auto min-h-0 
            ${activeThread ? 'w-7/12' : 'w-full'}
            transition-all duration-200
          `} 
          ref={messageContainerRef}
        >
          {channelId ? (
            <>
              <div className="px-4 pt-24 pb-12 text-center">
                <h2 className="text-xl font-bold mb-1">{channelType === 'channel' ? '# ' : ''}{channelName}</h2>
                <p className="text-gray-500">
                  This is the beginning of {channelType === 'channel' ? `#${channelName}` : `your conversation with ${channelName}`}
                </p>
              </div>
              <div className="pb-6">
                {messages.reduce((acc, message, index) => {
                  const prevMessage = messages[index - 1];
                  const isConsecutive = prevMessage && prevMessage.user.id === message.user.id;
                  const currentDate = new Date(message.createdAt);
                  const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
                  const isNewDay = !prevDate || 
                    currentDate.getDate() !== prevDate.getDate() || 
                    currentDate.getMonth() !== prevDate.getMonth() || 
                    currentDate.getFullYear() !== prevDate.getFullYear();

                  // Add date separator if it's a new day
                  if (isNewDay) {
                    acc.push(
                      <div key={`date-${message.createdAt}`} className="flex items-center my-6 px-4">
                        <div className="flex-grow h-px bg-gray-300"></div>
                        <div className="mx-4 text-sm text-gray-500 font-medium">
                          {formatMessageDate(currentDate)}
                        </div>
                        <div className="flex-grow h-px bg-gray-300"></div>
                      </div>
                    );
                  }

                  if (!isConsecutive) {
                    acc.push(
                      <div 
                        key={message.id} 
                        className={`group relative flex w-full px-4 ${
                          hoveredMessageId === message.id ? 'bg-gray-100' : ''
                        } ${index > 0 ? 'mt-6' : ''}`}
                        onMouseEnter={() => setHoveredMessageId(message.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        <div className="flex">
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="w-10 h-10 flex-shrink-0 mr-3 mt-[3px] cursor-pointer">
                                <UserAvatar 
                                  src={message.user.image || undefined}
                                  alt={message.user.name || 'Unknown User'} 
                                  size={40} 
                                />
                              </div>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="p-0">
                              <UserProfile user={message.user} />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="flex-grow min-w-0 max-w-full">
                          <div className="flex items-center h-6">
                            <div className="font-semibold truncate leading-6">{message.user.name || 'Unknown User'}</div>
                            <div className="text-xs text-gray-500 ml-2 flex-shrink-0 leading-6">
                              {new Date(message.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className="break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[24px]">
                            {message.content}
                            {message.attachments?.map(attachment => renderAttachment(attachment))}
                          </div>
                          {message.reactions.length > 0 && (
                            <div className="mt-1">
                              {renderReactions(message.id, message.reactions)}
                            </div>
                          )}
                          {message.thread && (
                            <button
                              onClick={() => handleOpenThread(message.id)}
                              className="mt-2 text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>
                                {activeThread?.rootMessage.id === message.id 
                                  ? `${threadMessages[message.id]?.length || 0} ${threadMessages[message.id]?.length === 1 ? 'reply' : 'replies'}`
                                  : `${message.thread.messageCount || 0} ${message.thread.messageCount === 1 ? 'reply' : 'replies'}`
                                }
                              </span>
                            </button>
                          )}
                        </div>
                        {(hoveredMessageId === message.id || openEmojiPickerId === message.id) && (
                          <div className="absolute right-[9px] -top-[18px] flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                            <Popover onOpenChange={(open) => handleEmojiPickerOpenChange(message.id, open)}>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-md">
                                  <Image
                                    src="/icons/add-reaction.svg"
                                    alt="Add reaction"
                                    width={16}
                                    height={16}
                                  />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0" align="end">
                                <Picker
                                  data={data}
                                  onEmojiSelect={(emoji: any) => {
                                    handleAddReaction(message.id, emoji)
                                    setOpenEmojiPickerId(null)
                                  }}
                                  theme="light"
                                  previewPosition="none"
                                />
                              </PopoverContent>
                            </Popover>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 hover:bg-gray-100 rounded-md"
                              onClick={() => handleOpenThread(message.id)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    acc.push(
                      <div 
                        key={message.id} 
                        className={`group relative flex w-full px-4 ${
                          hoveredMessageId === message.id ? 'bg-gray-100' : ''
                        }`}
                        onMouseEnter={() => setHoveredMessageId(message.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                      >
                        <div className="flex">
                          <div className="w-10 h-10 flex-shrink-0 mr-3 mt-[3px] invisible">
                            <UserAvatar 
                              src={message.user.image || undefined}
                              alt={message.user.name || 'Unknown User'} 
                              size={40} 
                            />
                          </div>
                        </div>
                        <div className="flex-grow min-w-0 max-w-full">
                          <div className="break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[10px] py-[2px]">
                            {message.content}
                            {message.attachments?.map(attachment => renderAttachment(attachment))}
                          </div>
                          {message.reactions.length > 0 && (
                            <div className="mt-1">
                              {renderReactions(message.id, message.reactions)}
                            </div>
                          )}
                          {message.thread && (
                            <button
                              onClick={() => handleOpenThread(message.id)}
                              className="mt-2 text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>
                                {activeThread?.rootMessage.id === message.id 
                                  ? `${threadMessages[message.id]?.length || 0} ${threadMessages[message.id]?.length === 1 ? 'reply' : 'replies'}`
                                  : `${message.thread.messageCount || 0} ${message.thread.messageCount === 1 ? 'reply' : 'replies'}`
                                }
                              </span>
                            </button>
                          )}
                        </div>
                        {(hoveredMessageId === message.id || openEmojiPickerId === message.id) && (
                          <div className="absolute right-[9px] -top-[18px] flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                            <Popover onOpenChange={(open) => handleEmojiPickerOpenChange(message.id, open)}>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-md">
                                  <Image
                                    src="/icons/add-reaction.svg"
                                    alt="Add reaction"
                                    width={16}
                                    height={16}
                                  />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0" align="end">
                                <Picker
                                  data={data}
                                  onEmojiSelect={(emoji: any) => {
                                    handleAddReaction(message.id, emoji)
                                    setOpenEmojiPickerId(null)
                                  }}
                                  theme="light"
                                  previewPosition="none"
                                />
                              </PopoverContent>
                            </Popover>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 w-8 p-0 hover:bg-gray-100 rounded-md"
                              onClick={() => handleOpenThread(message.id)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return acc;
                }, [] as JSX.Element[])}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Loading messages...
            </div>
          )}
        </div>

        {/* Thread View */}
        {activeThread && (
          <div className="w-5/12 h-full flex flex-col overflow-hidden">
            <ThreadView
              rootMessage={activeThread.rootMessage}
              messages={threadMessages[activeThread.rootMessage.id] || []}
              onClose={handleCloseThread}
              onSendMessage={handleSendThreadMessage}
            />
          </div>
        )}
      </div>

      <div className="p-4 border-t mt-auto">
        {/* Show staged attachments */}
        {stagedAttachments.length > 0 && (
          <div className="mb-2 space-y-2">
            {stagedAttachments.map((attachment, index) => (
              <div key={index} className="flex items-center space-x-2 bg-gray-50 p-2 rounded-md">
                <Paperclip className="w-4 h-4 text-gray-500" />
                <span className="flex-1 truncate text-sm">{attachment.name}</span>
                <button
                  onClick={() => removeStagedAttachment(index)}
                  className="text-gray-500 hover:text-red-500"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder={stagedAttachments.length > 0 ? "Add a message or send files..." : "Type a message..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            disabled={!channelId}
            ref={inputRef}
          />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />
          <Button 
            variant="ghost" 
            size="icon" 
            disabled={!channelId}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Button 
            onClick={handleSendMessage} 
            disabled={!channelId || (newMessage.trim() === '' && stagedAttachments.length === 0)}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {/* Upload progress indicators */}
        {Object.entries(uploadingFiles).length > 0 && (
          <div className="mt-2 space-y-2">
            {Object.entries(uploadingFiles).map(([id, { name }]) => (
              <div key={id} className="flex items-center space-x-2">
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span className="text-sm text-gray-600">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

