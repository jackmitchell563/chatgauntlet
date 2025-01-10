import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { notifyChannelClients } from '@/app/api/channels/[channelId]/events/route'
import { notifyThreadClients } from '../thread/events/route'

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

    // Get the message to verify access and get channelId
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
      },
      select: {
        id: true,
        channelId: true,
        parentMessageId: true
      }
    })

    if (!message) {
      return new NextResponse('Message not found', { status: 404 })
    }

    // Check if reaction already exists
    const existingReaction = await prisma.reaction.findFirst({
      where: {
        messageId: params.messageId,
        userId: session.user.id,
        emoji: body.emoji
      }
    })

    let updatedMessage
    if (existingReaction) {
      // Remove the reaction if it exists
      await prisma.reaction.delete({
        where: {
          id: existingReaction.id
        }
      })

      // Get updated message with reactions
      updatedMessage = await prisma.message.findUnique({
        where: {
          id: params.messageId
        },
        include: {
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

      // Notify clients about removed reaction
      const eventData = {
        type: 'REACTION_REMOVED',
        messageId: params.messageId,
        reactions: updatedMessage?.reactions || []
      }

      // Notify channel clients
      notifyChannelClients(message.channelId, eventData)

      // If this is a thread message, notify thread clients
      if (message.parentMessageId) {
        notifyThreadClients(message.parentMessageId, eventData)
      } else if (await hasThreadReplies(params.messageId)) {
        // If this is a root message with replies, notify thread clients
        notifyThreadClients(params.messageId, eventData)
      }
    } else {
      // Add new reaction
      await prisma.reaction.create({
        data: {
          messageId: params.messageId,
          userId: session.user.id,
          emoji: body.emoji
        }
      })

      // Get updated message with reactions
      updatedMessage = await prisma.message.findUnique({
        where: {
          id: params.messageId
        },
        include: {
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

      // Notify clients about added reaction
      const eventData = {
        type: 'REACTION_ADDED',
        messageId: params.messageId,
        reactions: updatedMessage?.reactions || []
      }

      // Notify channel clients
      notifyChannelClients(message.channelId, eventData)

      // If this is a thread message, notify thread clients
      if (message.parentMessageId) {
        notifyThreadClients(message.parentMessageId, eventData)
      } else if (await hasThreadReplies(params.messageId)) {
        // If this is a root message with replies, notify thread clients
        notifyThreadClients(params.messageId, eventData)
      }
    }

    return NextResponse.json(updatedMessage)
  } catch (error) {
    console.error('Error handling reaction:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

// Helper function to check if a message has thread replies
async function hasThreadReplies(messageId: string): Promise<boolean> {
  const count = await prisma.message.count({
    where: {
      parentMessageId: messageId
    }
  })
  return count > 0
} 