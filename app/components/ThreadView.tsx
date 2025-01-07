'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Send } from 'lucide-react'
import { UserAvatar } from './UserAvatar'
import { useSession } from 'next-auth/react'
import { useWorkspace } from '@/app/workspace/[workspaceId]/workspace-provider'

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
}

export function ThreadView({ 
  rootMessage, 
  messages, 
  onClose,
  onSendMessage 
}: ThreadViewProps) {
  const { data: session } = useSession()
  const [newMessage, setNewMessage] = useState('')
  const messageContainerRef = useRef<HTMLDivElement>(null)
  const { userStatuses } = useWorkspace()

  // Debug logging
  useEffect(() => {
    console.log('ThreadView mounted with root message:', rootMessage)
    console.log('Thread messages:', messages)
  }, [rootMessage, messages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight
    }
  }, [messages])

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

  return (
    <div className="flex flex-col h-full border-l">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-lg font-semibold">Thread</h2>
        <Button variant="ghost" onClick={onClose}>×</Button>
      </div>
      <div className="flex-1 overflow-y-auto" ref={messageContainerRef}>
        <div className="p-4 space-y-4">
          {/* Root message */}
          <div className="flex space-x-3">
            <UserAvatar 
              src={rootMessage.user.image || undefined}
              alt={rootMessage.user.name || 'Unknown User'} 
              size={40}
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold">{rootMessage.user.name || 'Unknown User'}</span>
                <span className="text-sm text-gray-500">{formatTime(rootMessage.createdAt)}</span>
              </div>
              <div className="mt-1">{rootMessage.content}</div>
            </div>

          </div>

          <div className="my-4 border-t pt-4">
            <div className="text-sm text-gray-500 mb-4">
              {messages.length} {messages.length === 1 ? 'reply' : 'replies'}
            </div>

            {/* Thread messages */}
            {messages.map((message) => (
              <div key={message.id} className="flex space-x-3 mb-4">
                <UserAvatar 
                  src={message.user.image || undefined}
                  alt={message.user.name || 'Unknown User'} 
                  size={32}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold">{message.user.name || 'Unknown User'}</span>
                    <span className="text-sm text-gray-500">{formatTime(message.createdAt)}</span>
                  </div>
                  <div className="mt-1">{message.content}</div>
                </div>
              </div>
            ))}
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
          />
          <Button onClick={handleSendMessage}>
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
} 