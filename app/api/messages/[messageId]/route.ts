import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/app/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    // Get the message and verify user access
    const message = await prisma.message.findFirst({
      where: {
        id: params.messageId,
        channel: {
          workspace: {
            members: {
              some: {
                userId: session.user.id,
              },
            },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        thread: true,
        parentMessage: true,
      },
    })

    if (!message) {
      return new NextResponse(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { status: 404 }
      )
    }

    return new NextResponse(JSON.stringify(message))
  } catch (error) {
    console.error('Error fetching message:', error)
    return new NextResponse(
      JSON.stringify({ 
        error: 'Failed to fetch message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500 }
    )
  }
} 