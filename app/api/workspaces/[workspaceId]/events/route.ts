import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { headers } from 'next/headers'
import { workspaceEventsOptions } from './options'

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

  const clientCallback = (data: string) => {
    writer.write(encoder.encode(data)).catch(console.error)
  }

  await workspaceEventsOptions.handleConnection(params.workspaceId, clientCallback)

  // Clean up when client disconnects
  request.signal.addEventListener('abort', () => {
    workspaceEventsOptions.handleDisconnection(params.workspaceId, clientCallback)
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