import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { z } from 'zod'

// In-memory storage for user statuses
// This will be lost on server restart, but that's acceptable for user status
const userStatuses = new Map<string, { workspaceId: string; status: string }>()

const updateStatusSchema = z.object({
  userId: z.string(),
  status: z.string(),
})

export async function GET(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    // Get all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: params.workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    })

    // Build status object
    const statuses: { [userId: string]: string } = {}
    members.forEach(member => {
      if (member.user?.id) {
        const userStatus = userStatuses.get(member.user.id)
        statuses[member.user.id] = (userStatus?.workspaceId === params.workspaceId) 
          ? userStatus.status 
          : 'Active'
      }
    })

    return new NextResponse(JSON.stringify(statuses))
  } catch (error) {
    console.error('Error fetching user statuses:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch user statuses' }),
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
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
    const body = updateStatusSchema.parse(json)

    // Verify the user is a member of the workspace
    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId: body.userId,
      },
    })

    if (!member) {
      return new NextResponse(
        JSON.stringify({ error: 'User is not a member of this workspace' }),
        { status: 403 }
      )
    }

    // Update the user's status
    userStatuses.set(body.userId, {
      workspaceId: params.workspaceId,
      status: body.status,
    })

    // Get all workspace members' statuses
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: params.workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    })

    // Build status object
    const statuses: { [userId: string]: string } = {}
    members.forEach(member => {
      if (member.user?.id) {
        const userStatus = userStatuses.get(member.user.id)
        statuses[member.user.id] = (userStatus?.workspaceId === params.workspaceId) 
          ? userStatus.status 
          : 'Active'
      }
    })

    return new NextResponse(JSON.stringify(statuses))
  } catch (error) {
    console.error('Error updating user status:', error)
    if (error instanceof z.ZodError) {
      return new NextResponse(
        JSON.stringify({ error: 'Invalid status data', details: error.errors }),
        { status: 400 }
      )
    }
    return new NextResponse(
      JSON.stringify({ error: 'Failed to update user status' }),
      { status: 500 }
    )
  }
} 