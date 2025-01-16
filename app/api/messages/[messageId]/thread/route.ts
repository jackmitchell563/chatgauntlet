import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { notifyChannelClients } from '@/app/api/channels/[channelId]/events/options'
import { notifyThreadClients } from './events/options'

export async function POST(
  request: Request,
  { params }: { params: { messageId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const body = await request.json()

    // Get the root message to verify access and get channelId
    const rootMessage = await prisma.message.findFirst({
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
      },
      select: {
        id: true,
        channelId: true,
        attachments: true
      }
    })

    if (!rootMessage) {
      return new NextResponse('Message not found', { status: 404 })
    }

    // Create the thread message
    console.log('Thread API: Creating message with data:', {
      content: body.content,
      userId: session.user.id,
      channelId: rootMessage.channelId,
      parentMessageId: params.messageId,
      isAiResponse: body.isAiResponse || false
    });
    const threadMessage = await prisma.message.create({
      data: {
        content: body.content,
        userId: session.user.id,
        channelId: rootMessage.channelId,
        parentMessageId: params.messageId,
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
        attachments: true
      }
    })

    // Get all thread messages to send in the update
    const threadMessages = await prisma.message.findMany({
      where: {
        parentMessageId: params.messageId
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
        attachments: true
      }
    })

    // Notify thread clients about the new message
    notifyThreadClients(params.messageId, {
      type: 'THREAD_MESSAGE_ADDED',
      message: threadMessage,
      messages: threadMessages
    })

    // Also notify channel clients about the thread update
    console.log('Thread API: Sending THREAD_UPDATED event:', {
      type: 'THREAD_UPDATED',
      threadId: params.messageId,
      messageCount: threadMessages.length
    });
    notifyChannelClients(rootMessage.channelId, {
      type: 'THREAD_UPDATED',
      threadId: params.messageId,
      messages: threadMessages,
      messageCount: threadMessages.length
    })

    return NextResponse.json({
      message: threadMessage,
      messages: threadMessages
    })
  } catch (error) {
    console.error('Error creating thread message:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
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

  try {
    // Verify access to the thread
    const rootMessage = await prisma.message.findFirst({
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
        }
      }
    })

    if (!rootMessage) {
      return new NextResponse('Thread not found', { status: 404 })
    }

    // Get all thread messages
    const messages = await prisma.message.findMany({
      where: {
        parentMessageId: params.messageId
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
        attachments: true
      }
    })

    return NextResponse.json({
      rootMessage,
      messages
    })
  } catch (error) {
    console.error('Error fetching thread:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
} 