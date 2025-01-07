import { User } from 'lucide-react'
import Image from 'next/image'

interface UserAvatarProps {
  src?: string
  alt: string
  size?: number
}

export function UserAvatar({ src, alt, size = 40 }: UserAvatarProps) {
  return (
    <div 
      className="rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center"
      style={{ 
        width: size, 
        height: size,
        boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.1)'
      }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          className="object-cover"
        />
      ) : (
        <User className="text-gray-400" style={{ width: size * 0.6, height: size * 0.6 }} />
      )}
    </div>
  )
}

