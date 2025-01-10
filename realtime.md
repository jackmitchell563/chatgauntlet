# Real-time Updates with Server-Sent Events (SSE)

This document explains how we implement real-time updates across multiple users in our application using Server-Sent Events (SSE). This approach provides a lightweight, unidirectional communication channel from server to clients, perfect for broadcasting updates to all connected users.

## Overview

Our implementation uses three main components:
1. An SSE endpoint that maintains connections with clients
2. API endpoints that broadcast events
3. Client-side listeners that react to events

## Server-Side Implementation

### 1. SSE Connection Management

We maintain a map of active connections per workspace, allowing us to broadcast events to specific workspace members:

```typescript
// app/api/workspaces/[workspaceId]/events/route.ts

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
```

### 2. SSE Endpoint

The SSE endpoint handles client connections and manages the event stream:

```typescript
export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  // Register client connection
  if (!workspaceConnections.has(params.workspaceId)) {
    workspaceConnections.set(params.workspaceId, new Set())
  }
  const connections = workspaceConnections.get(params.workspaceId)!

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }
  connections.add(clientCallback)

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    connections.delete(clientCallback)
    if (connections.size === 0) {
      workspaceConnections.delete(params.workspaceId)
    }
    writer.close().catch(console.error)
  })

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

### 3. Broadcasting Events

API endpoints can broadcast events to all connected clients when changes occur:

```typescript
// Example: Channel update endpoint
export async function PATCH(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  // ... validation and authorization ...

  // Update the channel
  const updatedChannel = await prisma.channel.update({
    where: { id: params.channelId },
    data: { name: body.name }
  })

  // Notify all workspace clients
  notifyWorkspaceClients(channel.workspaceId, {
    type: 'CHANNEL_UPDATED',
    channel: updatedChannel
  })

  return NextResponse.json(updatedChannel)
}
```

## Client-Side Implementation

### 1. Establishing Connection

The client establishes an SSE connection and listens for events:

```typescript
// app/workspace/[workspaceId]/workspace-provider.tsx

export function WorkspaceProvider({ workspace, userId, children }) {
  useEffect(() => {
    const eventSource = new EventSource(`/api/workspaces/${workspace.id}/events`)

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      
      switch (data.type) {
        case 'CHANNEL_UPDATED':
          setWorkspace(prev => ({
            ...prev,
            channels: prev.channels.map(c => 
              c.id === data.channel.id ? data.channel : c
            )
          }))
          break

        case 'CHANNEL_DELETED':
          setWorkspace(prev => ({
            ...prev,
            channels: prev.channels.filter(c => c.id !== data.channelId)
          }))
          // Redirect if needed
          if (selectedChannelId === data.channelId) {
            setSelectedChannelId(data.generalChannelId)
          }
          break
      }
    }

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error)
      eventSource.close()
    }

    return () => eventSource.close()
  }, [workspace.id, selectedChannelId])

  // ... rest of provider code ...
}
```

## Advantages of this Approach

1. **Lightweight**: SSE is more lightweight than WebSocket for unidirectional communication
2. **Built-in Reconnection**: Browsers automatically handle reconnection if the connection drops
3. **Simple Protocol**: Uses standard HTTP, making it easier to implement and maintain
4. **Scalable**: Each workspace has its own connection pool, preventing unnecessary broadcasts
5. **Real-time**: Updates are pushed immediately to all connected clients
6. **Stateful**: Maintains active connections without polling

## Event Types

Our system currently supports these event types:

```typescript
type WorkspaceEvent = 
  | { type: 'CHANNEL_UPDATED', channel: Channel }
  | { type: 'CHANNEL_DELETED', channelId: string, generalChannelId: string }
  | { type: 'connected' }
```

## Best Practices

1. **Error Handling**: Always implement error handlers and cleanup
2. **Connection Management**: Clean up connections when clients disconnect
3. **Type Safety**: Use TypeScript to ensure event type safety
4. **State Management**: Update client state atomically when receiving events
5. **Reconnection**: Handle connection failures gracefully
6. **Authentication**: Secure the SSE endpoint with proper authentication

## Limitations

1. Maximum number of concurrent connections per server (depends on server configuration)
2. One-way communication (server to client only)
3. No built-in message delivery guarantees

## Future Improvements

1. Add heartbeat mechanism to detect stale connections
2. Implement message queuing for offline clients
3. Add event versioning for backward compatibility
4. Implement rate limiting per workspace
5. Add connection pooling for better scalability 