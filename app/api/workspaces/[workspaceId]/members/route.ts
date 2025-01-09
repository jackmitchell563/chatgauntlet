import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'

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
    // First verify the user is a member of the workspace
    const userMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: params.workspaceId,
          userId: session.user.id
        }
      }
    })

    if (!userMembership) {
      return new NextResponse(
        JSON.stringify({ error: 'Not a member of this workspace' }),
        { status: 403 }
      )
    }

    // Fetch all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: params.workspaceId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      },
      orderBy: {
        user: {
          name: 'asc'
        }
      }
    })

    return new NextResponse(JSON.stringify(members))
  } catch (error) {
    console.error('Error fetching workspace members:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to fetch workspace members' }),
      { status: 500 }
    )
  }
} 