// Store active connections per workspace
const workspaceConnections = new Map<string, Set<(data: string) => void>>()

// Helper to send events to all workspace clients
export function notifyWorkspaceClients(workspaceId: string, event: any) {
  const connections = workspaceConnections.get(workspaceId)
  if (connections) {
    const eventData = `data: ${JSON.stringify(event)}\n\n`
    connections.forEach(client => client(eventData))
  }
}

export const workspaceEventsOptions = {
  workspaceConnections,
  notifyWorkspaceClients,
  
  // Function to handle new connections
  handleConnection: async (
    workspaceId: string, 
    clientCallback: (data: string) => void
  ) => {
    // Register client connection
    if (!workspaceConnections.has(workspaceId)) {
      workspaceConnections.set(workspaceId, new Set())
    }
    const connections = workspaceConnections.get(workspaceId)!
    connections.add(clientCallback)
  },

  // Function to handle disconnections
  handleDisconnection: (workspaceId: string, clientCallback: (data: string) => void) => {
    const connections = workspaceConnections.get(workspaceId)
    if (connections) {
      connections.delete(clientCallback)
      if (connections.size === 0) {
        workspaceConnections.delete(workspaceId)
      }
    }
  }
} 