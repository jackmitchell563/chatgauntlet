import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
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

export async function GET(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Verify user has access to this channel
  const channel = await prisma.channel.findFirst({
    where: {
      id: params.channelId,
      workspace: {
        members: {
          some: {
            userId: session.user.id
          }
        }
      }
    }
  })

  if (!channel) {
    return new NextResponse('Channel not found', { status: 404 })
  }

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  // Register client connection
  if (!channelConnections.has(params.channelId)) {
    channelConnections.set(params.channelId, new Set())
  }
  const connections = channelConnections.get(params.channelId)!

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }
  connections.add(clientCallback)

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    connections.delete(clientCallback)
    if (connections.size === 0) {
      channelConnections.delete(params.channelId)
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