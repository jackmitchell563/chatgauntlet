import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { channelEventsOptions } from './options'

export async function GET(
  request: Request,
  { params }: { params: { channelId: string } }
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
    await channelEventsOptions.handleConnection(params.channelId, session.user.id, clientCallback)
  } catch (error) {
    return new NextResponse('Channel not found', { status: 404 })
  }

  // Clean up on disconnect
  request.signal.addEventListener('abort', () => {
    channelEventsOptions.handleDisconnection(params.channelId, clientCallback)
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