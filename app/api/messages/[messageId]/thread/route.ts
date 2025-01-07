import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/app/lib/prisma'

const createThreadMessageSchema = z.object({
  content: z.string().min(1),
})

export async function GET(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  console.log('Thread API called for message:', params.messageId)
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    // First, get the message and verify user access
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
      },
    })

    console.log('Found message:', message)

    if (!message) {
      return new NextResponse(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { status: 404 }
      )
    }

    // Get thread replies and count separately
    const [threadReplies, replyCount] = await Promise.all([
      prisma.message.findMany({
        where: {
          parentMessageId: message.id,
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
        },
        orderBy: {
          createdAt: 'asc',
        },
      }),
      prisma.message.count({
        where: {
          parentMessageId: message.id,
        },
      }),
    ])

    // If no thread exists yet, create one
    let threadId = message.threadId
    if (!threadId) {
      console.log('Creating new thread')
      const thread = await prisma.thread.create({
        data: {
          rootMessage: {
            connect: { id: message.id },
          },
        },
      })
      threadId = thread.id
      console.log('Created thread:', thread)

      // Update the message with the new thread ID
      await prisma.message.update({
        where: { id: message.id },
        data: { threadId: thread.id },
      })
    }

    return new NextResponse(JSON.stringify({
      rootMessage: {
        id: message.id,
        content: message.content,
        createdAt: message.createdAt,
        user: message.user,
        reactions: message.reactions,
        thread: {
          id: threadId,
          messageCount: replyCount
        }
      },
      messages: threadReplies,
    }))
  } catch (error) {
    console.error('Error fetching thread:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch thread' }),
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  console.log('Creating thread message for:', params.messageId)
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    const json = await request.json()
    const body = createThreadMessageSchema.parse(json)

    // Get the root message
    const rootMessage = await prisma.message.findFirst({
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
        thread: true,
      },
    })

    if (!rootMessage) {
      return new NextResponse(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { status: 404 }
      )
    }

    // Create the thread if it doesn't exist
    let threadId = rootMessage.threadId
    if (!threadId) {
      const thread = await prisma.thread.create({
        data: {
          rootMessage: {
            connect: { id: rootMessage.id },
          },
        },
      })
      threadId = thread.id

      // Update the root message with the thread ID
      await prisma.message.update({
        where: { id: rootMessage.id },
        data: { threadId: thread.id },
      })
    }

    // Create the thread message
    const threadMessage = await prisma.message.create({
      data: {
        content: body.content,
        user: {
          connect: { id: session.user.id },
        },
        channel: {
          connect: { id: rootMessage.channelId },
        },
        parentMessage: {
          connect: { id: rootMessage.id },
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
      },
    })

    console.log('Thread message created:', threadMessage.id)
    return new NextResponse(JSON.stringify(threadMessage))
  } catch (error) {
    console.error('Error creating thread message:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to create thread message' }),
      { status: 500 }
    )
  }
} 