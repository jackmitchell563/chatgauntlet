'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Plus, LogIn } from 'lucide-react'

interface JoinWorkspaceDialogProps {
  onCreateWorkspaceClick: () => void
}

export function JoinWorkspaceDialog({ onCreateWorkspaceClick }: JoinWorkspaceDialogProps) {
  const [workspaceId, setWorkspaceId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)

  const handleJoinWorkspace = async () => {
    if (!workspaceId.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/join`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join workspace')
      }

      // Close dialog and navigate to the workspace
      setIsOpen(false)
      router.push(`/workspace/${workspaceId}`)
    } catch (err) {
      console.error('Error joining workspace:', err)
      setError(err instanceof Error ? err.message : 'Failed to join workspace')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex gap-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
      <Button 
        className="flex-1"
        onClick={onCreateWorkspaceClick}
      >
        <Plus className="h-4 w-4 mr-2" />
        Create new workspace
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="flex-1">
            <LogIn className="h-4 w-4 mr-2" />
            Join existing workspace
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join a Workspace</DialogTitle>
            <DialogDescription>
              Enter the workspace ID to join an existing workspace.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <Input
              placeholder="Workspace ID"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <Button 
              className="w-full" 
              onClick={handleJoinWorkspace}
              disabled={isLoading || !workspaceId.trim()}
            >
              {isLoading ? 'Joining...' : 'Join Workspace'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 