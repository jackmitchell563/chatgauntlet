import Image from 'next/image'
// ...

interface Message {
  id: string
  content: string
  user: {
    id: string
    name?: string
    image?: string
  }
  metadata?: {
    isAI?: boolean
  }
  // ...
}

export function MessageItem({ message }: { message: Message }) {
  const isAiMessage = message.metadata?.isAI === true

  return (
    <div className="flex items-start mb-2">
      {isAiMessage ? (
        <Image src="/icons/robot.svg" alt="AI Bot" width={32} height={32} />
      ) : (
        // If not AI, show the real user's avatar
        <img src={message.user?.image ?? '/default-avatar.png'} alt="Avatar" className="w-8 h-8 rounded-full" />
      )}

      <div className="ml-2">
        <div className="text-sm font-semibold">
          {isAiMessage ? 'AI Bot' : (message.user?.name || 'Unknown')}
        </div>
        <div className={isAiMessage ? 'text-blue-600' : ''}>
          {message.content}
        </div>
      </div>
    </div>
  )
} 