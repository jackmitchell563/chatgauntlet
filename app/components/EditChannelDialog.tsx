import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface EditChannelDialogProps {
  isOpen: boolean
  onClose: () => void
  onChannelUpdated: (channel: any) => void
  channel: {
    id: string
    name: string
  }
}

export function EditChannelDialog({ isOpen, onClose, onChannelUpdated, channel }: EditChannelDialogProps) {
  const [channelName, setChannelName] = useState(channel.name)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch(`/api/channels/${channel.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: channelName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update channel')
      }

      const updatedChannel = await res.json()
      onChannelUpdated(updatedChannel)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update channel')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Channel Name</DialogTitle>
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
            <Button type="submit" disabled={!channelName || channelName === channel.name || isLoading}>
              {isLoading ? 'Updating...' : 'Update Channel'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
} 