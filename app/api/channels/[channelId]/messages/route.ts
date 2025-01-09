import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'

const createMessageSchema = z.object({
  content: z.string(),
  attachments: z.array(z.object({
    name: z.string(),
    type: z.string(),
    url: z.string(),
    size: z.number(),
  })).optional(),
})

export async function GET(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    // First verify the channel exists and user has access
    const channel = await prisma.channel.findFirst({
      where: {
        id: params.channelId,
        workspace: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
    })

    if (!channel) {
      return new NextResponse(
        JSON.stringify({ error: 'Channel not found or access denied' }),
        { status: 404 }
      )
    }

    // Get messages with their thread reply counts
    const messages = await prisma.$transaction(async (tx) => {
      const msgs = await tx.message.findMany({
        where: {
          channelId: params.channelId,
          parentMessageId: null,
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
          attachments: true,
          thread: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      })

      // Get reply counts for each message
      const replyCounts = await Promise.all(
        msgs.map(msg =>
          tx.message.count({
            where: {
              parentMessageId: msg.id,
            },
          })
        )
      )

      return msgs.map((msg, i) => ({
        ...msg,
        replyCount: replyCounts[i],
      }))
    })

    // Transform the messages to match our interface
    const transformedMessages = messages.map(message => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      channelId: message.channelId,
      userId: message.userId,
      user: message.user,
      reactions: message.reactions,
      attachments: message.attachments,
      thread: message.replyCount > 0 || message.thread ? {
        id: message.thread?.id || message.id,
        messageCount: message.replyCount
      } : undefined
    }))

    return new NextResponse(JSON.stringify(transformedMessages))
  } catch (error) {
    console.error('Error fetching messages:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch messages' }),
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    const json = await request.json()
    const body = createMessageSchema.parse(json)

    // Verify channel exists and user has access
    const channel = await prisma.channel.findFirst({
      where: {
        id: params.channelId,
        workspace: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
    })

    if (!channel) {
      return new NextResponse(
        JSON.stringify({ error: 'Channel not found or access denied' }),
        { status: 404 }
      )
    }

    // Create message with attachments if provided
    const message = await prisma.message.create({
      data: {
        content: body.content,
        channelId: params.channelId,
        userId: session.user.id,
        attachments: body.attachments ? {
          createMany: {
            data: body.attachments.map(attachment => ({
              ...attachment,
              userId: session.user.id,
            })),
          },
        } : undefined,
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
        attachments: true,
      },
    })

    return new NextResponse(JSON.stringify(message))
  } catch (error) {
    console.error('Error creating message:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid message data', details: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to create message' }),
      { status: 500 }
    )
  }
} 