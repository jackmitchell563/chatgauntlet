import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'

const searchQuerySchema = z.object({
  query: z.string().min(1),
  limit: z.number().optional(),
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
    // Parse search query from URL
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('query')
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined

    const validatedData = searchQuerySchema.parse({ query, limit })

    // Verify channel access
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

    // Search messages
    const messages = await prisma.message.findMany({
      where: {
        channelId: params.channelId,
        content: {
          contains: validatedData.query,
          mode: 'insensitive',
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
      orderBy: {
        createdAt: 'desc',
      },
      take: validatedData.limit,
    })

    return new NextResponse(JSON.stringify(messages))
  } catch (error) {
    console.error('Error searching messages:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid search query', details: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to search messages' }),
      { status: 500 }
    )
  }
} 