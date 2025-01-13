import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../auth/[...nextauth]/options'
import { threadEventsOptions } from './options'

export async function GET(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }

  try {
    await threadEventsOptions.handleConnection(params.messageId, session.user.id, clientCallback)
  } catch (error) {
    return new NextResponse('Thread not found', { status: 404 })
  }

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    threadEventsOptions.handleDisconnection(params.messageId, clientCallback)
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