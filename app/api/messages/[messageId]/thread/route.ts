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
    console.log('Thread API: No session found')
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    console.log('Thread API: Fetching message with ID:', params.messageId)
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
        channel: true,
      },
    })

    console.log('Thread API: Found message:', {
      messageId: message?.id,
      hasThread: !!message?.thread,
      channelId: message?.channelId
    })

    if (!message) {
      console.log('Thread API: Message not found or access denied')
      return new NextResponse(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { status: 404 }
      )
    }

    // Get thread replies and count separately
    console.log('Thread API: Fetching thread replies')
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

    console.log('Thread API: Found replies:', {
      replyCount,
      threadRepliesCount: threadReplies.length
    })

    // Create thread if it doesn't exist
    let threadId = message.threadId
    if (!threadId) {
      console.log('Thread API: Creating new thread')
      try {
        const thread = await prisma.thread.create({
          data: {
            rootMessage: {
              connect: { id: message.id },
            },
          },
        })
        threadId = thread.id
        console.log('Thread API: Created thread:', thread)

        // Update the message with the new thread ID
        await prisma.message.update({
          where: { id: message.id },
          data: { threadId: thread.id },
        })
      } catch (error) {
        console.error('Thread API: Error creating thread:', error)
        // If thread creation fails, we can still return the message and replies
        // Just use the message ID as a temporary thread ID
        threadId = message.id
      }
    }

    const response = {
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
    }

    console.log('Thread API: Sending response:', {
      rootMessageId: response.rootMessage.id,
      threadId: response.rootMessage.thread.id,
      messageCount: response.messages.length
    })

    return new NextResponse(JSON.stringify(response))
  } catch (error) {
    console.error('Thread API Error:', error)
    return new NextResponse(
      JSON.stringify({ 
        error: 'Failed to fetch thread',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  try {
    console.log('Creating thread message for:', params.messageId)
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return new NextResponse(
        JSON.stringify({ error: 'You must be logged in' }),
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const json = await request.json()
    const body = createThreadMessageSchema.parse(json)

    // Get the root message and its channel
    const rootMessage = await prisma.message.findUnique({
      where: {
        id: params.messageId,
      },
      include: {
        channel: true,
      },
    })

    if (!rootMessage) {
      return new NextResponse(
        JSON.stringify({ error: 'Message not found' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify user has access to the channel
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        userId: session.user.id,
        workspaceId: rootMessage.channel.workspaceId,
      },
    })

    if (!hasAccess) {
      return new NextResponse(
        JSON.stringify({ error: 'Access denied' }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Create the thread message
    const threadMessage = await prisma.message.create({
      data: {
        content: body.content,
        userId: session.user.id,
        channelId: rootMessage.channelId,
        parentMessageId: rootMessage.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        reactions: true,
      },
    })

    return new NextResponse(
      JSON.stringify(threadMessage),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Thread message creation error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      messageId: params.messageId
    })

    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid message format', details: error.errors }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new NextResponse(
      JSON.stringify({ 
        error: 'Failed to create thread message',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
} 