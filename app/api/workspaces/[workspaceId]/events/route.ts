import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { headers } from 'next/headers'

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

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const headersList = headers()
  const acceptHeader = headersList.get('accept')
  if (acceptHeader !== 'text/event-stream') {
    return new NextResponse('Invalid headers', { status: 400 })
  }

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  // Add this client's connection to the workspace
  if (!workspaceConnections.has(params.workspaceId)) {
    workspaceConnections.set(params.workspaceId, new Set())
  }
  const connections = workspaceConnections.get(params.workspaceId)!

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }
  connections.add(clientCallback)

  // Clean up when client disconnects
  request.signal.addEventListener('abort', () => {
    connections.delete(clientCallback)
    if (connections.size === 0) {
      workspaceConnections.delete(params.workspaceId)
    }
    writer.close().catch(console.error)
  })

  // Send initial connection message
  writer.write(encoder.encode('data: {"type":"connected"}\n\n')).catch(console.error)

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
} 