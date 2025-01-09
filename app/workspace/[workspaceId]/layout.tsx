import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../api/auth/[...nextauth]/options'
import { prisma } from '@/app/lib/prisma'
import { WorkspaceProvider } from './workspace-provider'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  params: {
    workspaceId: string
  }
}

async function getWorkspaceData(workspaceId: string, userId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: {
        where: { userId },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        }
      },
      channels: {
        where: {
          OR: [
            { type: 'PUBLIC' },
            {
              type: 'PRIVATE',
              // Add members relation when we implement private channels
            }
          ]
        },
        orderBy: { name: 'asc' }
      }
    }
  })

  if (!workspace || workspace.members.length === 0) {
    return null
  }

  return workspace
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
  const session = await getServerSession(authOptions)
  
  if (!session?.user?.id) {
    redirect('/login')
  }

  const workspace = await getWorkspaceData(params.workspaceId, session.user.id)
  
  if (!workspace) {
    redirect('/workspaces')
  }

  return (
    <WorkspaceProvider 
      workspace={workspace} 
      userId={session.user.id}
    >
      <div className="flex h-screen overflow-hidden">
        {children}
      </div>
    </WorkspaceProvider>
  )
} 