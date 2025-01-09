import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { userId } = body

    // Verify both users are members of the workspace
    const [currentUserMembership, otherUserMembership] = await Promise.all([
      prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: params.workspaceId,
            userId: session.user.id
          }
        }
      }),
      prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: params.workspaceId,
            userId
          }
        }
      })
    ])

    if (!currentUserMembership || !otherUserMembership) {
      return NextResponse.json(
        { error: 'One or both users are not members of this workspace' },
        { status: 403 }
      )
    }

    // Check if a DM channel already exists between these users
    const dmChannelName = `DM:${[session.user.id, userId].sort().join('-')}`
    let channel = await prisma.channel.findFirst({
      where: {
        workspaceId: params.workspaceId,
        type: 'DM',
        name: dmChannelName
      }
    })

    // If no channel exists, create one
    if (!channel) {
      channel = await prisma.channel.create({
        data: {
          name: dmChannelName,
          type: 'DM',
          workspaceId: params.workspaceId
        }
      })
    }

    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error in DM route:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 