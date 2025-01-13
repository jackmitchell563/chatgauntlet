import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { notifyWorkspaceClients } from '../../workspaces/[workspaceId]/events/options'

const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, {
    message: "Channel name can only contain lowercase letters, numbers, and hyphens"
  }),
})

export async function PATCH(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const json = await request.json()
    const body = updateChannelSchema.parse(json)

    // Get the channel to check if it's #general
    const channel = await prisma.channel.findUnique({
      where: { id: params.channelId },
      include: { workspace: { select: { id: true } } }
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Don't allow editing #general
    if (channel.name === 'general') {
      return NextResponse.json(
        { error: 'Cannot modify the general channel' },
        { status: 403 }
      )
    }

    // Verify user is a member of the workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: channel.workspaceId,
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

    // Update the channel
    const updatedChannel = await prisma.channel.update({
      where: { id: params.channelId },
      data: { name: body.name }
    })

    // Notify all workspace clients about the channel update
    notifyWorkspaceClients(channel.workspaceId, {
      type: 'CHANNEL_UPDATED',
      channel: updatedChannel
    })

    return NextResponse.json(updatedChannel)
  } catch (error) {
    console.error('Error updating channel:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid channel data', details: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to update channel' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the channel to check if it's #general
    const channel = await prisma.channel.findUnique({
      where: { id: params.channelId },
      include: { workspace: { select: { id: true } } }
    })

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    // Don't allow deleting #general
    if (channel.name === 'general') {
      return NextResponse.json(
        { error: 'Cannot delete the general channel' },
        { status: 403 }
      )
    }

    // Verify user is a member of the workspace
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: channel.workspaceId,
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

    // Delete the channel
    await prisma.channel.delete({
      where: { id: params.channelId }
    })

    // Notify all workspace clients about the channel deletion
    notifyWorkspaceClients(channel.workspaceId, {
      type: 'CHANNEL_DELETED',
      channelId: params.channelId,
      generalChannelId: await prisma.channel.findFirst({
        where: { workspaceId: channel.workspaceId, name: 'general' }
      }).then(c => c?.id)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting channel:', error)
    return NextResponse.json(
      { error: 'Failed to delete channel' },
      { status: 500 }
    )
  }
} 