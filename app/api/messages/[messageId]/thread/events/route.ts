import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../../auth/[...nextauth]/options'
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

export async function GET(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Verify user has access to this thread
  const message = await prisma.message.findFirst({
    where: {
      id: params.messageId,
      channel: {
        workspace: {
          members: {
            some: {
              userId: session.user.id
            }
          }
        }
      }
    }
  })

  if (!message) {
    return new NextResponse('Thread not found', { status: 404 })
  }

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  // Register client connection
  if (!threadConnections.has(params.messageId)) {
    threadConnections.set(params.messageId, new Set())
  }
  const connections = threadConnections.get(params.messageId)!

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }
  connections.add(clientCallback)

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    connections.delete(clientCallback)
    if (connections.size === 0) {
      threadConnections.delete(params.messageId)
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