import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { notifyChannelClients } from '../events/options'
import { syncMessagesToPinecone } from '@/lib/sync'

export async function GET(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
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

    // First get all main messages
    const messages = await prisma.message.findMany({
      where: {
        channelId: params.channelId,
        parentMessageId: null // Only get main messages, not thread replies
      },
      orderBy: {
        createdAt: 'asc'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        attachments: true,
        _count: {
          select: {
            threadReplies: true // Count thread replies
          }
        }
      }
    })

    // Transform the messages to include thread information
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
      isAiResponse: message.isAiResponse,
      thread: message._count.threadReplies > 0 ? {
        id: message.id, // Use message ID as thread ID
        messageCount: message._count.threadReplies
      } : undefined
    }))

    return NextResponse.json(transformedMessages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json()

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

    // Create the message with attachments if any
    const message = await prisma.message.create({
      data: {
        content: body.content,
        channelId: params.channelId,
        userId: session.user.id,
        isAiResponse: body.isAiResponse || false,
        attachments: body.attachments ? {
          createMany: {
            data: body.attachments.map((attachment: any) => ({
              ...attachment,
              userId: session.user.id
            }))
          }
        } : undefined
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        },
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        attachments: true,
        channel: {
          select: {
            workspaceId: true
          }
        },
        _count: {
          select: {
            threadReplies: true
          }
        }
      }
    })

    // Sync the new message to Pinecone asynchronously
    syncMessagesToPinecone([message])
      .catch(error => {
        console.error('Background Pinecone sync failed:', error)
        // The error is logged but won't affect the message sending
      })

    // Transform the message to include thread information
    const transformedMessage = {
      ...message,
      thread: message._count.threadReplies > 0 ? {
        id: message.id,
        messageCount: message._count.threadReplies
      } : undefined
    }

    // Notify all connected clients about the new message
    notifyChannelClients(params.channelId, {
      type: 'NEW_MESSAGE',
      message: transformedMessage
    })

    return NextResponse.json(transformedMessage)
  } catch (error) {
    console.error('Error creating message:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 