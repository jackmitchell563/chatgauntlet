export interface Channel {
  id: number
  name: string
  type: 'channel' | 'dm'
}

export interface DirectMessage {
  id: number
  name: string
}

export interface Message {
  id: number
  channelId: number
  sender: string
  content: string
  timestamp: string
} 