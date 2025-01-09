import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'

const createReactionSchema = z.object({
  emoji: z.string().min(1),
})

export async function POST(
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
    const json = await request.json()
    const body = createReactionSchema.parse(json)

    // Check if message exists and user has access
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
    })

    if (!message) {
      return new NextResponse(
        JSON.stringify({ error: 'Message not found or access denied' }),
        { status: 404 }
      )
    }

    // Create or remove reaction
    const existingReaction = await prisma.reaction.findFirst({
      where: {
        messageId: params.messageId,
        userId: session.user.id,
        emoji: body.emoji,
      },
    })

    if (existingReaction) {
      // Remove reaction if it already exists
      await prisma.reaction.delete({
        where: {
          id: existingReaction.id,
        },
      })
    } else {
      // Add new reaction
      await prisma.reaction.create({
        data: {
          emoji: body.emoji,
          messageId: params.messageId,
          userId: session.user.id,
        },
      })
    }

    // Return updated message with reactions
    const updatedMessage = await prisma.message.findUnique({
      where: {
        id: params.messageId,
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

    return new NextResponse(JSON.stringify(updatedMessage))
  } catch (error) {
    console.error('Error handling reaction:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid reaction data', details: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to handle reaction' }),
      { status: 500 }
    )
  }
} 