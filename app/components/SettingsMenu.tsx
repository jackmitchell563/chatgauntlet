'use client'

import { useState } from 'react'
import { signOut } from '../lib/auth'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Settings, LogOut } from 'lucide-react'

interface SettingsMenuProps {
  onThemeChange: (color: string) => void
}

const themeColors = [
  '#1a202c', // Dark Blue Gray
  '#2d3748', // Darker Blue Gray
  '#2C3E50', // Midnight Blue
  '#34495E', // Wet Asphalt
  '#4A5568', // Gray
]

export function SettingsMenu({ onThemeChange }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {themeColors.map((color) => (
          <DropdownMenuItem key={color} onSelect={() => onThemeChange(color)}>
            <div className="flex items-center">
              <div
                className="w-4 h-4 rounded-full mr-2"
                style={{ backgroundColor: color }}
              />
              <span>Theme {themeColors.indexOf(color) + 1}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600" onSelect={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

