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
import { MessageSquare } from 'lucide-react'

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

export function ThreadView({ 
  rootMessage: initialRootMessage, 
  messages: initialMessages, 
  onClose,
  onSendMessage,
  onAddReaction,
  openTimestamp,
  pendingScrollToMessageId,
  onScrollComplete
}: ThreadViewProps) {
  const { data: session } = useSession()
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [rootMessage, setRootMessage] = useState(initialRootMessage)
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { userStatuses } = useWorkspace()
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [openEmojiPickerId, setOpenEmojiPickerId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Update root message when prop changes
  useEffect(() => {
    setRootMessage(initialRootMessage)
  }, [initialRootMessage])

  // Add SSE connection for thread updates
  useEffect(() => {
    if (!rootMessage.id || !session) return;

    let eventSource: EventSource | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    let isMounted = true;

    const setupSSE = () => {
      if (!isMounted) return;

      console.log('Setting up SSE connection for thread:', rootMessage.id);
      eventSource = new EventSource(`/api/messages/${rootMessage.id}/thread/events`);

      eventSource.onopen = () => {
        console.log('Thread SSE connection opened');
        retryCount = 0;
      };

      eventSource.onmessage = (event) => {
        if (!isMounted) return;

        const data = JSON.parse(event.data);
        console.log('Thread SSE event received:', data);

        switch (data.type) {
          case 'THREAD_MESSAGE_ADDED':
            setMessages(prev => {
              // Only add if message doesn't exist
              const messageExists = prev.some(m => m.id === data.message.id);
              if (!messageExists) {
                const newMessages = [...prev, data.message].sort((a, b) => 
                  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );

                // Check if we should auto-scroll
                if (messageContainerRef.current) {
                  const container = messageContainerRef.current;
                  const threshold = 150; // pixels from bottom
                  const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
                  
                  if (distanceFromBottom <= threshold) {
                    requestAnimationFrame(() => {
                      container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                      });
                    });
                  }
                }

                return newMessages;
              }
              return prev;
            });
            break;

          case 'REACTION_ADDED':
          case 'REACTION_REMOVED':
            console.log('ThreadView: Reaction event received:', {
              type: data.type,
              messageId: data.messageId,
              reactions: data.reactions,
              isRootMessage: data.messageId === rootMessage.id,
              currentMessages: messages
            });

            // Update root message if it's the target
            if (data.messageId === rootMessage.id) {
              console.log('ThreadView: Updating root message reactions');
              setRootMessage(prev => ({
                ...prev,
                reactions: data.reactions
              }));
            }

            // Update thread message if it's the target
            setMessages(prev => {
              const updated = prev.map(msg =>
                msg.id === data.messageId
                  ? { ...msg, reactions: data.reactions }
                  : msg
              );
              console.log('ThreadView: Updated messages after reaction:', updated);
              return updated;
            });
            break;
        }
      };

      eventSource.onerror = (error) => {
        console.error('Thread SSE connection error:', error);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }

        if (!isMounted) return;

        // Attempt to reconnect with exponential backoff
        if (retryCount < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
          retryCount++;
          console.log(`Attempting to reconnect thread SSE (attempt ${retryCount}/${maxRetries}) after ${delay}ms`);
          setTimeout(setupSSE, delay);
        } else {
          console.error('Max thread SSE reconnection attempts reached');
          setError('Lost connection to thread. Please refresh the page.');
        }
      };
    };

    setupSSE();

    return () => {
      console.log('Cleaning up thread SSE connection');
      isMounted = false;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [rootMessage.id, session]);

  // Add formatMessageDate function
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
          <div className="group relative flex w-full hover:bg-gray-100 px-2 rounded-md"
               onMouseEnter={() => setHoveredMessageId(rootMessage.id)}
               onMouseLeave={() => setHoveredMessageId(null)}>
            <div className="flex">
              <Popover>
                <PopoverTrigger asChild>
                  <div className="w-10 h-10 flex-shrink-0 mr-3 mt-[3px] cursor-pointer">
                    <UserAvatar 
                      src={rootMessage.user.image || undefined}
                      alt={rootMessage.user.name || 'Unknown User'} 
                      size={40}
                    />
                  </div>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-0">
                  <UserProfile user={rootMessage.user} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-grow min-w-0 max-w-full">
              <div className="flex items-center h-6">
                <div className="font-semibold truncate leading-6">{rootMessage.user.name || 'Unknown User'}</div>
                <div className="text-xs text-gray-500 ml-2 flex-shrink-0 leading-6">
                  {new Date(rootMessage.createdAt).toLocaleTimeString()}
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
              const currentDate = new Date(message.createdAt);
              const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
              const isNewDay = !prevDate || 
                currentDate.getDate() !== prevDate.getDate() || 
                currentDate.getMonth() !== prevDate.getMonth() || 
                currentDate.getFullYear() !== prevDate.getFullYear();

              // Add date separator if it's a new day
              const elements = [];
              if (isNewDay) {
                elements.push(
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
                elements.push(
                  <div key={message.id} 
                       className={`group relative flex w-full hover:bg-gray-100 px-2 rounded-md ${index > 0 ? 'mt-3' : ''}`}
                       onMouseEnter={() => setHoveredMessageId(message.id)}
                       onMouseLeave={() => setHoveredMessageId(null)}
                       data-message-id={message.id}>
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
                elements.push(
                  <div key={message.id} 
                       className="group relative flex w-full hover:bg-gray-100 px-2 rounded-md"
                       onMouseEnter={() => setHoveredMessageId(message.id)}
                       onMouseLeave={() => setHoveredMessageId(null)}
                       data-message-id={message.id}>
                    <div className="flex">
                      <div className="w-10 flex-shrink-0 mr-3 relative">
                        {hoveredMessageId === message.id && (
                          <div className="absolute -left-[10px] right-0 top-[9px] text-[10px] text-gray-500 leading-none text-right">
                            {new Date(message.createdAt).toLocaleTimeString([], { 
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex-grow min-w-0 max-w-full">
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
              return elements;
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