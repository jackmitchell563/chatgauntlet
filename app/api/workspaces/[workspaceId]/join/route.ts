import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { Role } from '@prisma/client'

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { workspaceId } = params

    // Check if workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          where: { userId: session.user.id }
        }
      }
    })

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Check if user is already a member
    if (workspace.members.length > 0) {
      return NextResponse.json({ error: 'Already a member of this workspace' }, { status: 400 })
    }

    // Add user as a member with MEMBER role
    const member = await prisma.workspaceMember.create({
      data: {
        userId: session.user.id,
        workspaceId,
        role: Role.MEMBER
      }
    })

    return NextResponse.json(member)
  } catch (error) {
    console.error('Error joining workspace:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
} 