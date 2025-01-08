'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Send } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { useSession } from 'next-auth/react'
import { useWorkspace } from '@/app/workspace/[workspaceId]/workspace-provider'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import Image from 'next/image'
import Picker from '@emoji-mart/react'
import data from '@emoji-mart/data'

interface ThreadMessage {
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
}

interface ThreadViewProps {
  rootMessage: ThreadMessage
  messages: ThreadMessage[]
  onClose: () => void
  onSendMessage: (content: string) => void
  onAddReaction: (messageId: string, emoji: { native: string }) => void
  openTimestamp: number
  pendingScrollToMessageId?: string | null
  onScrollComplete?: () => void
}

export function ThreadView({ 
  rootMessage, 
  messages, 
  onClose,
  onSendMessage,
  onAddReaction,
  openTimestamp,
  pendingScrollToMessageId,
  onScrollComplete
}: ThreadViewProps) {
  const { data: session } = useSession()
  const [newMessage, setNewMessage] = useState('')
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { userStatuses } = useWorkspace()
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [openEmojiPickerId, setOpenEmojiPickerId] = useState<string | null>(null)

  // Debug logging
  useEffect(() => {
    console.log('ThreadView mounted with root message:', rootMessage)
    console.log('Thread messages:', messages)
  }, [rootMessage, messages])

  // Focus input when thread opens or is re-opened
  useEffect(() => {
    inputRef.current?.focus()
  }, [rootMessage.id, openTimestamp])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const prevLength = messageContainerRef.current?.dataset.messageCount ? 
      parseInt(messageContainerRef.current.dataset.messageCount) : 0
    
    if (messageContainerRef.current) {
      messageContainerRef.current.dataset.messageCount = messages.length.toString()
      
      // Only scroll if the number of messages has increased
      if (messages.length > prevLength) {
        requestAnimationFrame(() => {
          if (messageContainerRef.current) {
            messageContainerRef.current.scrollTo({
              top: messageContainerRef.current.scrollHeight,
              behavior: 'smooth'
            })
          }
        })
      }
    }
  }, [messages])

  // Add effect to handle scrolling to specific message
  useEffect(() => {
    if (!pendingScrollToMessageId || !messageContainerRef.current) return

    console.log('ThreadView: Attempting to scroll to message:', pendingScrollToMessageId)

    // Wait for React to finish updating
    setTimeout(() => {
      const messageElement = messageContainerRef.current?.querySelector(
        `[data-message-id="${pendingScrollToMessageId}"]`
      )

      if (messageElement) {
        console.log('ThreadView: Found message element, scrolling')
        messageElement.scrollIntoView({ block: 'center', behavior: 'instant' })
        messageElement.classList.add('highlight-message')
        setTimeout(() => {
          messageElement.classList.remove('highlight-message')
        }, 2000)
        
        // Notify parent that scroll is complete
        onScrollComplete?.()
      } else {
        console.error('ThreadView: Failed to find message element')
      }
    }, 100)
  }, [pendingScrollToMessageId, onScrollComplete])

  const handleSendMessage = () => {
    if (newMessage.trim()) {
      console.log('Sending thread message:', newMessage.trim())
      onSendMessage(newMessage.trim())
      setNewMessage('')
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const renderReactions = (messageId: string, reactions: ThreadMessage['reactions']) => {
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
      <div className="flex flex-wrap gap-1">
        {Object.entries(groupedReactions).map(([emoji, reaction]) => (
          <button
            key={emoji}
            className="flex items-center space-x-1 rounded px-2 py-0 text-sm bg-gray-100 hover:bg-gray-200"
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

  const handleEmojiPickerOpenChange = (messageId: string, open: boolean) => {
    setOpenEmojiPickerId(open ? messageId : null)
  }

  const handleAddReaction = async (messageId: string, emoji: { native: string }) => {
    if (!session) return
    
    console.log('ThreadView: Delegating reaction to parent', {
      messageId,
      emoji: emoji.native,
      rootMessageId: rootMessage.id,
      isRootMessage: messageId === rootMessage.id
    })
    
    onAddReaction(messageId, emoji)
  }

  return (
    <div className="flex flex-col h-full border-l">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold">Thread</h2>
        <Button variant="ghost" onClick={onClose}>×</Button>
      </div>
      <div className="flex-1 overflow-y-auto" ref={messageContainerRef}>
        <div className="p-4 space-y-4">
          {/* Root message */}
          <div className="group relative flex space-x-3"
               onMouseEnter={() => setHoveredMessageId(rootMessage.id)}
               onMouseLeave={() => setHoveredMessageId(null)}>
            <UserAvatar 
              src={rootMessage.user.image || undefined}
              alt={rootMessage.user.name || 'Unknown User'} 
              size={40}
            />
            <div className="flex-1">
              <div className="flex items-center h-6">
                <div className="font-semibold truncate leading-6">{rootMessage.user.name || 'Unknown User'}</div>
                <div className="text-xs text-gray-500 ml-2 flex-shrink-0 leading-6">
                  {formatTime(rootMessage.createdAt)}
                </div>
              </div>
              <div className="break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[24px]">
                {rootMessage.content}
              </div>
              {rootMessage.reactions?.length > 0 && (
                <div className="pb-1">
                  {renderReactions(rootMessage.id, rootMessage.reactions)}
                </div>
              )}
            </div>
            {(hoveredMessageId === rootMessage.id || openEmojiPickerId === rootMessage.id) && (
              <div className="absolute right-0 -top-[18px] flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-gray-200 p-1">
                <Popover onOpenChange={(open) => handleEmojiPickerOpenChange(rootMessage.id, open)}>
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
                        handleAddReaction(rootMessage.id, emoji)
                        setOpenEmojiPickerId(null)
                      }}
                      theme="light"
                      previewPosition="none"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <div className="my-4 border-t pt-4">
            <div className="text-sm text-gray-500 mb-4">
              {messages.length} {messages.length === 1 ? 'reply' : 'replies'}
            </div>

            {/* Thread messages */}
            {messages.map((message, index) => {
              const prevMessage = messages[index - 1];
              const isConsecutive = prevMessage && prevMessage.user.id === message.user.id;
              
              if (!isConsecutive) {
                return (
                  <div key={message.id} 
                       className={`group relative flex w-full ${index > 0 ? 'mt-3' : ''}`}
                       onMouseEnter={() => setHoveredMessageId(message.id)}
                       onMouseLeave={() => setHoveredMessageId(null)}
                       data-message-id={message.id}>
                    <div className="flex">
                      <div className="w-10 h-10 flex-shrink-0 mr-3 mt-[3px]">
                        <UserAvatar 
                          src={message.user.image || undefined}
                          alt={message.user.name || 'Unknown User'} 
                          size={40}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center h-6">
                        <div className="font-semibold truncate leading-6">{message.user.name || 'Unknown User'}</div>
                        <div className="text-xs text-gray-500 ml-2 flex-shrink-0 leading-6">
                          {formatTime(message.createdAt)}
                        </div>
                      </div>
                      <div className="break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[24px]">
                        {message.content}
                      </div>
                      {message.reactions?.length > 0 && (
                        <div className="pb-1">
                          {renderReactions(message.id, message.reactions)}
                        </div>
                      )}
                    </div>
                    {(hoveredMessageId === message.id || openEmojiPickerId === message.id) && (
                      <div className="absolute right-0 -top-[18px] flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-gray-200 p-1">
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
                      </div>
                    )}
                  </div>
                );
              } else {
                return (
                  <div key={message.id} 
                       className="group relative flex w-full"
                       onMouseEnter={() => setHoveredMessageId(message.id)}
                       onMouseLeave={() => setHoveredMessageId(null)}
                       data-message-id={message.id}>
                    <div className="flex">
                      <div className="w-10 h-[1px] flex-shrink-0 mr-3 mt-[3px] invisible">
                        <UserAvatar 
                          src={message.user.image || undefined}
                          alt={message.user.name || 'Unknown User'} 
                          size={40}
                        />
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[10px] py-[2px]">
                        {message.content}
                      </div>
                      {message.reactions?.length > 0 && (
                        <div className="pb-1">
                          {renderReactions(message.id, message.reactions)}
                        </div>
                      )}
                    </div>
                    {(hoveredMessageId === message.id || openEmojiPickerId === message.id) && (
                      <div className="absolute right-0 -top-[18px] flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-lg shadow-sm border border-gray-200 p-1">
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
                      </div>
                    )}
                  </div>
                );
              }
            })}
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="p-4 border-t">
        <div className="flex items-center space-x-2">
          <Input
            type="text"
            placeholder="Reply in thread..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            ref={inputRef}
          />
          <Button 
            onClick={handleSendMessage}
            disabled={!newMessage.trim()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
} 