import { prisma } from '@/app/lib/prisma'

// Store active connections per thread
const threadConnections = new Map<string, Set<(data: string) => void>>()

// Helper to send events to all thread clients
export function notifyThreadClients(messageId: string, event: any) {
  const connections = threadConnections.get(messageId)
  if (connections) {
    const eventData = `data: ${JSON.stringify(event)}\n\n`
    connections.forEach(client => client(eventData))
  }
}

export const threadEventsOptions = {
  threadConnections,
  notifyThreadClients,
  
  // Function to handle new connections
  handleConnection: async (
    messageId: string, 
    userId: string, 
    clientCallback: (data: string) => void
  ) => {
    // Verify user has access to this thread
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        channel: {
          workspace: {
            members: {
              some: {
                userId: userId
              }
            }
          }
        }
      }
    })

    if (!message) {
      throw new Error('Thread not found')
    }

    // Register client connection
    if (!threadConnections.has(messageId)) {
      threadConnections.set(messageId, new Set())
    }
    const connections = threadConnections.get(messageId)!
    connections.add(clientCallback)

    return message
  },

  // Function to handle disconnections
  handleDisconnection: (messageId: string, clientCallback: (data: string) => void) => {
    const connections = threadConnections.get(messageId)
    if (connections) {
      connections.delete(clientCallback)
      if (connections.size === 0) {
        threadConnections.delete(messageId)
      }
    }
  }
} 