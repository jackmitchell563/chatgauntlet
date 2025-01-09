import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            userId: session.user.id
          }
        }
      },
      include: {
        members: {
          where: {
            userId: session.user.id
          },
          select: {
            role: true
          }
        },
        _count: {
          select: {
            members: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    })

    return new NextResponse(JSON.stringify(workspaces))
  } catch (error) {
    console.error('Error fetching workspaces:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch workspaces' }),
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    const json = await request.json()
    const body = createWorkspaceSchema.parse(json)

    const workspace = await prisma.workspace.create({
      data: {
        name: body.name,
        description: body.description,
        members: {
          create: {
            userId: session.user.id,
            role: 'OWNER'
          }
        },
        channels: {
          create: {
            name: 'general',
            description: 'General discussion',
            type: 'PUBLIC'
          }
        }
      },
      include: {
        members: {
          where: {
            userId: session.user.id
          },
          select: {
            role: true
          }
        },
        _count: {
          select: {
            members: true
          }
        }
      }
    })

    return new NextResponse(JSON.stringify(workspace))
  } catch (error) {
    console.error('Error creating workspace:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid workspace data', details: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to create workspace' }),
      { status: 500 }
    )
  }
} 