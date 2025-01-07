import { Button } from './ui/button'
import { Input } from './ui/input'
import { Search, Bell, Settings } from 'lucide-react'
import { SettingsMenu } from './SettingsMenu'

interface TopBarProps {
  channelName: string | undefined
  channelType: 'channel' | 'dm' | undefined
  onThemeChange: (color: string) => void
}

export function TopBar({ channelName, channelType, onThemeChange }: TopBarProps) {
  return (
    <div className="bg-white border-b p-4 flex items-center justify-between">
      <h2 className="text-xl font-semibold">
        {channelType === 'channel' ? '# ' : ''}{channelName || 'Select a channel'}
      </h2>
      <div className="flex items-center space-x-4">
        <div className="relative">
          <Input type="text" placeholder="Search" className="pl-8" />
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
        <SettingsMenu onThemeChange={onThemeChange} />
      </div>
    </div>
  )
}

