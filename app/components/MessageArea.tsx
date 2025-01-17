'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Send, Paperclip, MessageSquare, Bot, BotOff } from 'lucide-react'
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
import { SearchResults } from './SearchResults'

// Create a global flag for message polling
let isPollingEnabled = true;
let lastFetchTimestamp: string | null = null;  // Track last fetch time

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
  isAiResponse?: boolean
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
  shouldScrollToBottom?: boolean
  searchQuery?: string
  onSearchResultClick?: (messageId: string) => void
  selectedMessageId?: string | null
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
  
  console.log('UserProfile: Rendering for user', {
    userId: user.id,
    status,
    allStatuses: userStatuses
  })
  
  return (
    <div className="p-4 w-72">
      <div className="flex items-center space-x-4">
        <UserAvatar 
          src={user.image || '/icons/defaultavatar.png'}
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
  shouldScrollOnLoad = false,
  shouldScrollToBottom,
  searchQuery,
  onSearchResultClick,
  selectedMessageId
}: MessageAreaProps) {
  const { data: session, status } = useSession()
  const [newMessage, setNewMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>(() => {
    // Ensure initialMessages is an array and filter/sort it
    return (Array.isArray(initialMessages) ? initialMessages : [])
      .filter(msg => !msg.parentMessageId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
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
  const [threadOpenTimestamp, setThreadOpenTimestamp] = useState<number>(0)
  const [searchResults, setSearchResults] = useState<Message[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const pendingScrollToMessageId = useRef<string | null>(null)
  const [pendingThreadScroll, setPendingThreadScroll] = useState<string | null>(null)
  const sseConnectionRef = useRef<EventSource | null>(null)
  const [isAiEnabled, setIsAiEnabled] = useState(false)
  const optimisticMessageIdsRef = useRef<Set<string>>(new Set())

  // Add effect to handle channel changes
  useEffect(() => {
    if (channelId !== lastChannelIdRef.current) {
      console.log('Channel changed, resetting state');
      setMessages([]); // Reset messages when channel changes
      setError(null);
      setIsLoading(false); // Reset AI loading state
      setIsLoadingMessages(false); // Reset message loading state
      lastChannelIdRef.current = channelId;
      initialFetchRef.current = false;
      shouldScrollRef.current = true; // This will trigger scroll to bottom after messages load
      
      // Immediately scroll to bottom of the empty container
      if (messageContainerRef.current) {
        messageContainerRef.current.scrollTo({
          top: messageContainerRef.current.scrollHeight,
          behavior: 'instant'
        });
      }
    }
  }, [channelId]);

  // Replace the SSE effect
  useEffect(() => {
    if (!channelId || status !== 'authenticated') return;

    let eventSource: EventSource | null = null;
    let retryCount = 0;
    const maxRetries = 3;
    let isMounted = true;
    let currentController: AbortController | null = null;
    
    const fetchInitialMessages = async () => {
      // If we're already fetching, abort the previous fetch
      if (currentController) {
        currentController.abort();
      }
      
      // Don't fetch if we've already fetched for this channel
      if (!channelId || initialFetchRef.current) return;
      
      // Create new controller for this fetch
      currentController = new AbortController();
      setIsLoadingMessages(true);
      
      try {
        const res = await fetch(`/api/channels/${channelId}/messages`, {
          signal: currentController.signal
        });
        
        // Check if we're still on the same channel before proceeding
        if (channelId !== lastChannelIdRef.current) {
          return;
        }
        
        if (!res.ok) {
          throw new Error('Failed to fetch messages');
        }
        
        const data = await res.json();
        
        // Only update state if we're still on the same channel
        if (channelId === lastChannelIdRef.current) {
          setMessages(data.filter((msg: Message) => !msg.parentMessageId));
          initialFetchRef.current = true;
          setIsLoadingMessages(false);
        }
      } catch (error) {
        // Only set error if it's not an abort error and we're still on the same channel
        if (!(error instanceof DOMException && error.name === 'AbortError') && channelId === lastChannelIdRef.current) {
          console.error('Error fetching messages:', error);
          setError(error instanceof Error ? error.message : 'Failed to fetch messages');
          setIsLoadingMessages(false);
        }
      }
    };

    // Start by fetching messages
    fetchInitialMessages();
    
    // Then set up SSE connection
    console.log('Setting up SSE connection for channel:', channelId);
    eventSource = new EventSource(`/api/channels/${channelId}/events`);

    eventSource.onopen = () => {
      console.log('SSE connection opened for channel:', channelId);
      retryCount = 0;
    };

    eventSource.onmessage = (event) => {
      if (!isMounted) return;
      
      const data = JSON.parse(event.data);
      console.log('Channel SSE event received:', data);

      switch (data.type) {
        case 'NEW_MESSAGE':
          setMessages(prev => {
            // Find any optimistic message that matches this real message
            const optimisticMessage = prev.find(msg => 
              msg.id.startsWith('temp-') && 
              msg.content === data.message.content &&
              msg.user.id === data.message.user.id &&
              Math.abs(new Date(msg.createdAt).getTime() - new Date(data.message.createdAt).getTime()) < 10000
            );

            if (optimisticMessage) return prev;

            if (!prev.find(m => m.id === data.message.id)) {
              const newMessages = [...prev, data.message].sort((a, b) => 
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
              );

              if (messageContainerRef.current) {
                const container = messageContainerRef.current;
                const threshold = 150;
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

        case 'MESSAGE_UPDATED':
          setMessages(prev => prev.map(msg =>
            msg.id === data.message.id ? data.message : msg
          ));
          break;

        case 'MESSAGE_DELETED':
          setMessages(prev => prev.filter(msg => msg.id !== data.messageId));
          break;

        case 'REACTION_ADDED':
        case 'REACTION_REMOVED':
          setMessages(prev => {
            const messageToUpdate = prev.find(msg => msg.id === data.messageId);
            if (!messageToUpdate) return prev;
            
            return prev.map(msg =>
              msg.id === data.messageId
                ? { ...messageToUpdate, reactions: [...data.reactions] }
                : msg
            );
          });

          if (activeThread?.rootMessage.id === data.messageId) {
            setActiveThread(prev => prev ? {
              ...prev,
              rootMessage: {
                ...prev.rootMessage,
                reactions: [...data.reactions]
              }
            } : null);
          }
          break;

        case 'THREAD_MESSAGE_ADDED':
          setMessages(prev => prev.map(msg =>
            msg.id === data.message.parentMessageId
              ? {
                  ...msg,
                  thread: {
                    id: msg.id,
                    messageCount: data.messages.length,
                    lastMessage: data.message
                  }
                }
              : msg
          ));

          if (activeThread?.rootMessage.id === data.message.parentMessageId) {
            setThreadMessages(prev => ({
              ...prev,
              [data.message.parentMessageId]: data.messages
            }));

            setActiveThread(prev => prev ? {
              ...prev,
              messages: data.messages
            } : null);
          }
          break;

        case 'THREAD_UPDATED':
          console.log('MessageArea: Received THREAD_UPDATED event:', {
            threadId: data.threadId,
            messageCount: data.messageCount,
            currentMessage: messages.find(m => m.id === data.threadId)
          });
          setMessages(prev => {
            const updatedMessages = prev.map(msg =>
              msg.id === data.threadId
                ? {
                    ...msg,
                    thread: {
                      ...(msg.thread || {}),
                      id: data.threadId,
                      messageCount: data.messageCount
                    }
                  }
                : msg
            );
            console.log('MessageArea: State update details:', {
              threadId: data.threadId,
              oldMessage: prev.find(m => m.id === data.threadId),
              newMessage: updatedMessages.find(m => m.id === data.threadId),
              messageCountChanged: prev.find(m => m.id === data.threadId)?.thread?.messageCount !== data.messageCount
            });
            return updatedMessages;
          });
          console.log('MessageArea: Updated message with new thread count');
          
          setThreadMessages(prev => ({
            ...prev,
            [data.threadId]: data.messages
          }));
          
          if (activeThread?.rootMessage.id === data.threadId) {
            setActiveThread(prev => prev ? {
              ...prev,
              messages: data.messages
            } : null);
          }
          break;
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      
      if (!isMounted) return;
      
      if (retryCount < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        retryCount++;
        console.log(`Attempting to reconnect SSE (attempt ${retryCount}/${maxRetries}) after ${delay}ms`);
        setTimeout(() => {
          if (isMounted) {
            eventSource = new EventSource(`/api/channels/${channelId}/events`);
          }
        }, delay);
      } else {
        console.error('Max SSE reconnection attempts reached');
        setError('Lost connection to server. Please refresh the page.');
      }
    };

    // Cleanup
    return () => {
      console.log('Cleaning up SSE connection and state');
      isMounted = false;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (currentController) {
        currentController.abort();
        currentController = null;
      }
    };
  }, [channelId, status, session?.user?.id, activeThread]);

  const isNearBottom = () => {
    if (!messageContainerRef.current) return false
    const container = messageContainerRef.current
    const threshold = 150 // pixels from bottom
    const distanceFromBottom = container.scrollHeight - (container.scrollTop + container.clientHeight)
    return distanceFromBottom <= threshold
  }

  const handleSearchResultClick = async (messageId: string) => {
    console.log('MessageArea: Search result click received', {
      messageId,
      totalMessages: messages.length,
      messageIds: messages.map(m => m.id)
    })

    // Disable any auto-scrolling
    shouldScrollRef.current = false

    try {
      // Fetch the message to check if it's a thread message
      const res = await fetch(`/api/messages/${messageId}`)
      if (!res.ok) throw new Error('Failed to fetch message')
      const message = await res.json()

      if (message.parentMessageId) {
        console.log('MessageArea: Message is a thread reply', {
          messageId,
          parentMessageId: message.parentMessageId
        })
        
        // Set the message ID to scroll to in the thread
        setPendingThreadScroll(messageId)
        
        // First scroll to and open the parent message's thread
        pendingScrollToMessageId.current = message.parentMessageId
        await handleOpenThread(message.parentMessageId)
      } else {
        // Regular message, just scroll to it
        pendingScrollToMessageId.current = messageId
      }
    } catch (error) {
      console.error('Error handling search result click:', error)
      // Fallback to just trying to scroll to the message
      pendingScrollToMessageId.current = messageId
    }

    // Notify parent component after setting up scroll state
    if (onSearchResultClick) {
      onSearchResultClick(messageId)
    }
  }

  // Add effect to watch for messages updates and try scrolling
  useEffect(() => {
    if (!pendingScrollToMessageId.current || messages.length === 0) return

    // Wait for React to finish updating
    setTimeout(() => {
      const messageElement = messageContainerRef.current?.querySelector(
        `[data-message-id="${pendingScrollToMessageId.current}"]`
      )
      console.log('MessageArea: Scroll attempt:', {
        pendingId: pendingScrollToMessageId.current,
        elementFound: !!messageElement,
        messageCount: messages.length,
        hasMessageInArray: messages.some(m => m.id === pendingScrollToMessageId.current)
      })

      // Wait for message element to be available
      const waitForElement = async () => {
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds total (50 * 100ms)
        
        while (!messageElement && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (messageElement) {
          messageElement.scrollIntoView({ block: 'center', behavior: 'instant' })
          messageElement.classList.add('highlight-message')
          setTimeout(() => {
            messageElement.classList.remove('highlight-message')
          }, 2000)
          pendingScrollToMessageId.current = null
          console.log('MessageArea: Successfully scrolled to message')
        } else {
          console.error('MessageArea: Failed to find message element after waiting')
        }
      }

      waitForElement();
    }, 100) // Timeout to ensure DOM is ready
  }, [messages])

  const handleSendMessage = async () => {
    if (status !== 'authenticated' || !channelId) return;

    const messageContent = newMessage.trim();
    if ((!messageContent && stagedAttachments.length === 0)) return;

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`, // Temporary ID
      content: messageContent,
      createdAt: new Date().toISOString(),
      user: {
        id: session?.user?.id!,
        name: session?.user?.name ?? null,
        image: session?.user?.image ?? null,
      },
      reactions: [],
      attachments: stagedAttachments.map(att => ({
        ...att,
        id: `temp-${Date.now()}-${att.name}` // Add temporary ID
      }))
    };

    try {
      setError(null);
      
      // Track the optimistic message ID immediately
      optimisticMessageIdsRef.current.add(optimisticMessage.id);
      
      // Add optimistic message to UI immediately
      setMessages(prev => [...prev, optimisticMessage]);
      
      // Clear input fields immediately
      setNewMessage('');
      setStagedAttachments([]);
      
      // Scroll to bottom
      if (messageContainerRef.current) {
        messageContainerRef.current.scrollTo({
          top: messageContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
      
      if (isAiEnabled && messageContent) {
        setIsLoading(true);
        try {
          // First send the user's message
          const userMessageRes = await fetch(`/api/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: messageContent,
              attachments: stagedAttachments,
            }),
          });

          if (!userMessageRes.ok) {
            throw new Error('Failed to send message');
          }

          // Get the real message
          const realMessage = await userMessageRes.json();
          
          // Replace optimistic message with real one and update tracking
          optimisticMessageIdsRef.current.delete(optimisticMessage.id);
          optimisticMessageIdsRef.current.add(realMessage.id);
          
          setMessages(prev => 
            prev.map(msg => msg.id === optimisticMessage.id ? realMessage : msg)
          );

          // Then get and send the AI response
          const aiResponse = await fetch(`/api/channels/${channelId}/rag`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: messageContent }),
          });

          if (!aiResponse.ok) {
            const errorData = await aiResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to get AI response');
          }

          const aiData = await aiResponse.json();
          
          // Send AI's response as a new message
          const aiMessageRes = await fetch(`/api/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: aiData.response,
              isAiResponse: true,
            }),
          });

          if (!aiMessageRes.ok) {
            throw new Error('Failed to send AI response');
          }

        } catch (error) {
          console.error('Error in AI flow:', error);
          setError(error instanceof Error ? error.message : 'Failed to process AI response');
          
          // Remove optimistic message on error
          setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
        } finally {
          setIsLoading(false);
        }
      } else {
        // Regular message sending
        try {
          const res = await fetch(`/api/channels/${channelId}/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: messageContent,
              attachments: stagedAttachments,
            }),
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Failed to send message');
          }

          // Get the real message and track its ID
          const realMessage = await res.json();
          optimisticMessageIdsRef.current.add(realMessage.id);
          
          // Replace optimistic message with real one
          setMessages(prev => 
            prev.map(msg => msg.id === optimisticMessage.id ? realMessage : msg)
          );
        } catch (error) {
          console.error('Error sending message:', error);
          setError(error instanceof Error ? error.message : 'Failed to send message');
          
          // Remove optimistic message on error
          setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
        }
      }
    } catch (error) {
      console.error('Error in message flow:', error);
      setError(error instanceof Error ? error.message : 'Failed to process message');
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
    }
  };

  const handleAddReaction = async (messageId: string, emoji: { native: string }) => {
    if (status !== 'authenticated') return
    
    console.log('MessageArea: Adding reaction', {
      messageId,
      emoji: emoji.native,
      isThreadActive: !!activeThread,
      threadRootMessageId: activeThread?.rootMessage.id
    })
    
    try {
      console.log('MessageArea: Making API request to add reaction')
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
      console.log('MessageArea: Received updated message from API', updatedMessage)
      
      // Update main messages list
      console.log('MessageArea: Updating main messages list')
      setMessages(prev => prev.map(msg => 
        msg.id === messageId 
          ? { ...msg, reactions: updatedMessage.reactions }
          : msg
      ))

      // Update thread messages if this message is in a thread
      if (activeThread) {
        console.log('MessageArea: Thread is active, updating thread messages')
        if (messageId === activeThread.rootMessage.id) {
          console.log('MessageArea: Updating root message')
          setActiveThread(prev => prev ? {
            ...prev,
            rootMessage: { ...prev.rootMessage, reactions: updatedMessage.reactions }
          } : null)
        }
        
        // Update thread messages
        const threadId = activeThread.rootMessage.id
        console.log('MessageArea: Updating thread messages for thread', threadId)
        setThreadMessages(prev => {
          const updatedThreadMessages = [...(prev[threadId] || [])]
          const messageIndex = updatedThreadMessages.findIndex(msg => msg.id === messageId)
          console.log('MessageArea: Found message at index', messageIndex)
          if (messageIndex !== -1) {
            updatedThreadMessages[messageIndex] = {
              ...updatedThreadMessages[messageIndex],
              reactions: updatedMessage.reactions
            }
          }
          return {
            ...prev,
            [threadId]: updatedThreadMessages
          }
        })
      }
    } catch (err) {
      console.error('MessageArea: Error adding reaction:', err)
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
      <div className="flex flex-wrap gap-1">
        {Object.entries(groupedReactions).map(([emoji, reaction]) => (
          <button
            key={emoji}
            className={`flex items-center space-x-1 rounded px-2 py-0 text-sm ${
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
    console.log('Current message state:', messages.find(m => m.id === messageId))
    
    // Update timestamp to trigger focus even if same thread
    setThreadOpenTimestamp(Date.now())
    
    try {
      const res = await fetch(`/api/messages/${messageId}/thread`)
      if (!res.ok) {
        throw new Error('Failed to fetch thread')
      }
      const data = await res.json()
      console.log('Thread data received:', data)
      
      // Store thread messages in our thread messages state
      console.log('Current thread messages:', threadMessages[messageId])
      setThreadMessages(prev => {
        console.log('Setting thread messages:', {
          messageId,
          currentMessages: prev[messageId],
          newMessages: data.messages || []
        })
        return {
          ...prev,
          [messageId]: data.messages || []
        }
      })
      
      const targetMessage = messages.find(m => m.id === messageId)
      console.log('Target message found:', targetMessage)
      if (!targetMessage) return

      // Set the active thread for display without adding thread metadata if there are no replies
      console.log('Setting active thread:', {
        rootMessage: targetMessage,
        messages: data.messages || [],
        hasExistingThread: !!targetMessage.thread,
        existingMessageCount: targetMessage.thread?.messageCount
      })
      
      setActiveThread({
        rootMessage: targetMessage,
        messages: data.messages || []
      })
    } catch (err) {
      console.error('Error opening thread:', err)
      setError(err instanceof Error ? err.message : 'Failed to open thread')
    }
  }

  const handleSendThreadMessage = async (content: string, isAiResponse?: boolean, attachments?: {
    name: string;
    type: string;
    url: string;
    size: number;
  }[]) => {
    if (!activeThread?.rootMessage.id) return

    try {
      const res = await fetch(`/api/messages/${activeThread.rootMessage.id}/thread`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content, isAiResponse, attachments }),
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

      // Update the thread metadata in the main message list only when there are replies
      setMessages(prev => prev.map(msg => 
        msg.id === activeThread.rootMessage.id
          ? {
              ...msg,
              thread: {
                id: activeThread.rootMessage.thread?.id || msg.thread?.id || activeThread.rootMessage.id,
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
    if (activeThread) {
      console.log('Closing thread:', {
        messageId: activeThread.rootMessage.id,
        currentMessageCount: threadMessages[activeThread.rootMessage.id]?.length,
        hasThread: !!activeThread.rootMessage.thread
      })
    }
    setActiveThread(null)
    // Focus the main input when closing thread
    inputRef.current?.focus()
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
    const isVideo = attachment.type === 'video/mp4'
    
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
        ) : isVideo ? (
          <div className="relative rounded-lg overflow-hidden max-w-lg">
            <video 
              controls
              className="w-full max-h-[384px]"
              preload="metadata"
            >
              <source src={attachment.url} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
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

  // Function to detect and render MP4 links in message content
  const renderMessageContent = (content: string) => {
    // Regular expression to match MP4 links
    const mp4Regex = /(https?:\/\/[^\s<]+?\.mp4)\b/g
    const parts = content.split(mp4Regex)
    
    if (parts.length === 1) return content

    return (
      <>
        {parts.map((part, i) => {
          if (mp4Regex.test(part)) {
            return (
              <div key={i} className="mt-2 relative rounded-lg overflow-hidden max-w-lg">
                <video 
                  controls
                  className="w-full max-h-[384px]"
                  preload="metadata"
                >
                  <source src={part} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </div>
            )
          }
          return part
        })}
      </>
    )
  }

  // Search effect
  useEffect(() => {
    async function performSearch() {
      if (!channelId || !searchQuery?.trim()) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      try {
        const res = await fetch(`/api/channels/${channelId}/search?query=${encodeURIComponent(searchQuery)}`)
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
  }, [channelId, searchQuery])

  // Add effect to close thread when search starts
  useEffect(() => {
    if (searchQuery) {
      // Close any open thread when search starts
      setActiveThread(null)
    }
  }, [searchQuery])

  // Add effect to watch for messages updates and scroll to bottom if needed
  useEffect(() => {
    if (shouldScrollToBottom && messageContainerRef.current && messages.length > 0) {
      messageContainerRef.current.scrollTo({
        top: messageContainerRef.current.scrollHeight,
        behavior: 'instant'
      })
    }
  }, [messages, shouldScrollToBottom])

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden">
      <style jsx global>{`
        @keyframes highlightFade {
          0% { background-color: rgb(254 240 138); }
          100% { background-color: transparent; }
        }
        .highlight-message {
          animation: highlightFade 2s ease-out;
        }
      `}</style>
      <div className={`flex flex-1 min-h-0 ${activeThread ? 'divide-x' : ''}`}>
        <div 
          className={`
            flex-1 overflow-y-auto min-h-0 
            ${activeThread ? 'w-7/12' : 'w-full'}
            transition-all duration-200
          `} 
          ref={messageContainerRef}
        >
          {searchQuery ? (
            <div className="h-full">
              {isSearching ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-gray-500">Searching messages...</div>
                </div>
              ) : (
                <SearchResults
                  results={searchResults}
                  onResultClick={handleSearchResultClick}
                  isFullScreen
                />
              )}
            </div>
          ) : channelId ? (
            <>
              <div className="px-4 pt-24 pb-12 text-center">
                <h2 className="text-xl font-bold mb-1">{channelType === 'channel' ? '# ' : ''}{channelName}</h2>
                <p className="text-gray-500">
                  This is the beginning of {channelType === 'channel' ? `# ${channelName}` : `your conversation with ${channelName}`}
                </p>
              </div>
              <div className="pb-6">
                {messages.reduce((acc, message, index) => {
                  const prevMessage = messages[index - 1];
                  const currentDate = new Date(message.createdAt);
                  const prevDate = prevMessage ? new Date(prevMessage.createdAt) : null;
                  const isNewDay = !prevDate || 
                    currentDate.getDate() !== prevDate.getDate() || 
                    currentDate.getMonth() !== prevDate.getMonth() || 
                    currentDate.getFullYear() !== prevDate.getFullYear();

                  const isConsecutive = prevMessage && 
                    prevMessage.user.id === message.user.id && 
                    !message.isAiResponse && 
                    !prevMessage.isAiResponse &&
                    !isNewDay;

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
                          message.isAiResponse 
                            ? 'bg-blue-50 hover:bg-blue-100' 
                            : 'hover:bg-gray-100'
                        } ${
                          index > 0 ? 'mt-3' : ''
                        }`}
                        onMouseEnter={() => setHoveredMessageId(message.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                        data-message-id={message.id}
                      >
                        <div className="flex">
                          <Popover>
                            <PopoverTrigger asChild>
                              <div className="w-10 h-10 flex-shrink-0 mr-3 mt-[3px] cursor-pointer">
                                <UserAvatar 
                                  src={message.user.image || '/icons/defaultavatar.png'}
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
                            <div className={`font-semibold truncate leading-6 ${message.isAiResponse ? 'text-blue-600' : ''}`}>{message.user.name || 'Unknown User'}</div>
                            <div className="text-xs text-gray-500 ml-2 flex-shrink-0 leading-6">
                              {new Date(message.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                          <div className={`break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[24px] ${message.isAiResponse ? 'text-blue-600' : ''}`}>
                            {renderMessageContent(message.content)}
                            {message.attachments?.map(attachment => renderAttachment(attachment))}
                          </div>
                          {message.reactions.length > 0 && (
                            <div className="pb-1">
                              {renderReactions(message.id, message.reactions)}
                            </div>
                          )}
                          {((message.thread && message.thread.messageCount > 0) || activeThread?.rootMessage.id === message.id) && (
                            <button
                              onClick={() => handleOpenThread(message.id)}
                              className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1 pb-1"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>
                                {`${threadMessages[message.id]?.length || message.thread?.messageCount || 0} ${(threadMessages[message.id]?.length || message.thread?.messageCount || 0) === 1 ? 'reply' : 'replies'}`}
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
                          message.isAiResponse 
                            ? 'bg-blue-50 hover:bg-blue-100' 
                            : 'hover:bg-gray-100'
                        }`}
                        onMouseEnter={() => setHoveredMessageId(message.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                        data-message-id={message.id}
                      >
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
                          <div className={`break-words whitespace-pre-wrap overflow-hidden leading-6 min-h-[10px] py-[2px] ${message.isAiResponse ? 'text-blue-600' : ''}`}>
                            {renderMessageContent(message.content)}
                            {message.attachments?.map(attachment => renderAttachment(attachment))}
                          </div>
                          {message.reactions.length > 0 && (
                            <div className="pb-1">
                              {renderReactions(message.id, message.reactions)}
                            </div>
                          )}
                          {((message.thread && message.thread.messageCount > 0) || activeThread?.rootMessage.id === message.id) && (
                            <button
                              onClick={() => handleOpenThread(message.id)}
                              className="text-sm text-gray-500 hover:text-gray-700 flex items-center space-x-1 pb-1"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>
                                {`${threadMessages[message.id]?.length || message.thread?.messageCount || 0} ${(threadMessages[message.id]?.length || message.thread?.messageCount || 0) === 1 ? 'reply' : 'replies'}`}
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
        {activeThread && !searchQuery && (
          <div className="w-5/12 h-full flex flex-col overflow-hidden">
            <ThreadView
              rootMessage={activeThread.rootMessage}
              messages={threadMessages[activeThread.rootMessage.id] || []}
              onClose={handleCloseThread}
              onSendMessage={handleSendThreadMessage}
              onAddReaction={handleAddReaction}
              openTimestamp={threadOpenTimestamp}
              pendingScrollToMessageId={pendingThreadScroll}
              onScrollComplete={() => setPendingThreadScroll(null)}
            />
          </div>
        )}
      </div>

      {/* Message input area - hide completely during search */}
      {!searchQuery && (
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
            <button
              onClick={() => setIsAiEnabled(!isAiEnabled)}
              className={`p-2 rounded-md mr-2 ${
                isAiEnabled 
                  ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' 
                  : 'hover:bg-gray-100'
              }`}
              title={isAiEnabled ? 'Disable AI responses' : 'Enable AI responses'}
              disabled={!channelId}
            >
              {isAiEnabled ? (
                <Bot className="w-5 h-5" />
              ) : (
                <BotOff className="w-5 h-5" />
              )}
            </button>
            
            <input
              type="text"
              placeholder={isLoading ? 'Getting AI response...' : isLoadingMessages ? 'Loading messages...' : 'Type a message...'}
              className="flex-1 px-4 py-2 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              disabled={!channelId || isLoading || isLoadingMessages}
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              ref={inputRef}
            />

            <input
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
              ref={fileInputRef}
            />

            <Button
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={!channelId || isLoading || isLoadingMessages}
              className="px-2"
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            <Button
              onClick={handleSendMessage}
              disabled={!channelId || isLoading || (!newMessage.trim() && stagedAttachments.length === 0)}
              className="px-4 py-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-gray-300 border-t-white" />
              ) : (
                <Send className="w-5 h-5" />
              )}
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
      )}
    </div>
  )
}

