import { prisma } from '@/app/lib/prisma'

// Store active connections per channel
const channelConnections = new Map<string, Set<(data: string) => void>>()

// Helper to send events to all channel clients
export function notifyChannelClients(channelId: string, event: any) {
  const connections = channelConnections.get(channelId)
  if (connections) {
    const eventData = `data: ${JSON.stringify(event)}\n\n`
    connections.forEach(client => client(eventData))
  }
}

export const channelEventsOptions = {
  channelConnections,
  notifyChannelClients,
  
  // Function to handle new connections
  handleConnection: async (
    channelId: string, 
    userId: string, 
    clientCallback: (data: string) => void
  ) => {
    // Verify user has access to this channel
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        workspace: {
          members: {
            some: {
              userId: userId
            }
          }
        }
      }
    })

    if (!channel) {
      throw new Error('Channel not found')
    }

    // Register client connection
    if (!channelConnections.has(channelId)) {
      channelConnections.set(channelId, new Set())
    }
    const connections = channelConnections.get(channelId)!
    connections.add(clientCallback)

    return channel
  },

  // Function to handle disconnections
  handleDisconnection: (channelId: string, clientCallback: (data: string) => void) => {
    const connections = channelConnections.get(channelId)
    if (connections) {
      connections.delete(clientCallback)
      if (connections.size === 0) {
        channelConnections.delete(channelId)
      }
    }
  }
} 