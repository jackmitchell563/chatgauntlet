'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { MessageArea } from './components/MessageArea'

interface Channel {
  id: number
  name: string
  type: 'channel' | 'dm'
}

interface DirectMessage {
  id: number
  name: string
}

interface Message {
  id: number
  channelId: number
  sender: string
  content: string
  timestamp: string
  reactions: { [key: string]: Reaction }
}

interface Reaction {
  emoji: string
  count: number
  users: string[]
}

const defaultChannels: Channel[] = [
  { id: 1, name: 'general', type: 'channel' },
  { id: 2, name: 'random', type: 'channel' },
]

const defaultDirectMessages: DirectMessage[] = [
  { id: 3, name: 'John Doe' },
  { id: 4, name: 'Jane Smith' },
]

export default function Home() {
  const [channels, setChannels] = useState<Channel[]>(defaultChannels)
  const [directMessages, setDirectMessages] = useState<DirectMessage[]>(defaultDirectMessages)
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [themeColor, setThemeColor] = useState('#1a202c')

  useEffect(() => {
    // Set the default channel to #general when the component mounts
    const generalChannel = channels.find(channel => channel.name === 'general')
    if (generalChannel) {
      setSelectedChannel(generalChannel)
    }
  }, [channels])

  const handleChannelSelect = (channel: Channel) => {
    setSelectedChannel(channel)
  }

  const handleDirectMessageSelect = (dm: DirectMessage) => {
    const dmChannel: Channel = { id: dm.id, name: dm.name, type: 'dm' }
    setSelectedChannel(dmChannel)
  }

  const handleSendMessage = (content: string) => {
    if (selectedChannel) {
      const newMessage: Message = {
        id: messages.length + 1,
        channelId: selectedChannel.id,
        sender: 'You',
        content: content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        reactions: {}
      }
      setMessages([...messages, newMessage])
    }
  }

  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width)
  }

  const handleThemeChange = (color: string) => {
    setThemeColor(color)
  }

  const handleAddReaction = (messageId: number, emoji: { native: string }) => {
    setMessages(messages.map(message => {
      if (message.id === messageId) {
        const reactions = { ...message.reactions } || {}
        
        // If the reaction exists and the user has already reacted, remove their reaction
        if (reactions[emoji.native] && reactions[emoji.native].users.includes('You')) {
          reactions[emoji.native].count--
          reactions[emoji.native].users = reactions[emoji.native].users.filter(user => user !== 'You')
          
          // If no users are left for this reaction, remove it entirely
          if (reactions[emoji.native].count === 0) {
            delete reactions[emoji.native]
          }
        } else {
          // Add new reaction or add user to existing reaction
          if (!reactions[emoji.native]) {
            reactions[emoji.native] = {
              emoji: emoji.native,
              count: 1,
              users: ['You']
            }
          } else {
            reactions[emoji.native].count++
            reactions[emoji.native].users.push('You')
          }
        }
        
        return { ...message, reactions }
      }
      return message
    }))
  }

  const channelMessages = messages.filter(message => message.channelId === selectedChannel?.id)

  return (
    <div className="flex h-screen rounded-xl overflow-hidden">
      <Sidebar 
        channels={channels}
        directMessages={directMessages}
        onChannelSelect={handleChannelSelect}
        onDirectMessageSelect={handleDirectMessageSelect}
        selectedChannelId={selectedChannel?.id}
        width={sidebarWidth}
        onResize={handleSidebarResize}
        style={{ backgroundColor: themeColor }}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar 
          channelName={selectedChannel?.name} 
          channelType={selectedChannel?.type}
          onThemeChange={handleThemeChange}
        />
        <MessageArea 
          channelId={selectedChannel?.id}
          channelName={selectedChannel?.name}
          channelType={selectedChannel?.type}
          messages={channelMessages}
          onSendMessage={handleSendMessage}
          onAddReaction={handleAddReaction}
        />
      </div>
    </div>
  )
}

