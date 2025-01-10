'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useWorkspace } from '@/app/workspace/[workspaceId]/workspace-provider'

interface CreateChannelDialogProps {
  isOpen: boolean
  onClose: () => void
  onChannelCreated: (channel: any) => void
}

export function CreateChannelDialog({ isOpen, onClose, onChannelCreated }: CreateChannelDialogProps) {
  const [channelName, setChannelName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { workspace, updateWorkspaceChannels, setSelectedChannelId } = useWorkspace()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: channelName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to create channel')
      }

      const channel = await res.json()
      updateWorkspaceChannels([...workspace.channels, channel])
      onChannelCreated(channel)
      setSelectedChannelId(channel.id)
      onClose()
      setChannelName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a Channel</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="channelName">Channel Name</Label>
            <Input
              id="channelName"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g. team-updates"
              disabled={isLoading}
            />
            <p className="text-sm text-gray-500">
              Channel names can only contain lowercase letters, numbers, and hyphens.
            </p>
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!channelName || isLoading}>
              {isLoading ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 