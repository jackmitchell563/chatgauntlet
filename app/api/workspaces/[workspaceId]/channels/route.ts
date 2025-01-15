import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyWorkspaceClients } from '../events/options'

const createChannelSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, {
    message: "Channel name can only contain lowercase letters, numbers, and hyphens"
  }),
  description: z.string().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const json = await request.json()
    const body = createChannelSchema.parse(json)

    // Verify user is a member of the workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: params.workspaceId,
          userId: session.user.id
        }
      }
    })

    if (!member) {
      return NextResponse.json(
        { error: 'You are not a member of this workspace' },
        { status: 403 }
      )
    }

    // Create the channel
    const channel = await prisma.channel.create({
      data: {
        name: body.name,
        description: body.description,
        type: 'PUBLIC',
        workspaceId: params.workspaceId
      }
    })

    // Notify all workspace clients about the new channel
    notifyWorkspaceClients(params.workspaceId, {
      type: 'CHANNEL_CREATED',
      channel
    })

    return NextResponse.json(channel)
  } catch (error) {
    console.error('Error creating channel:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid channel data', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to create channel' },
      { status: 500 }
    )
  }
} 