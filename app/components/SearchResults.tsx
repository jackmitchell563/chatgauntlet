import { UserAvatar } from './UserAvatar'
import { MessageSquare } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface SearchResult {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string | null
    image: string | null
  }
  reactions: {
    id: string
    emoji: string
    user: {
      id: string
      name: string | null
    }
  }[]
  thread?: {
    id: string
    messageCount: number
  }
}

interface SearchResultsProps {
  results: SearchResult[]
  onResultClick: (messageId: string) => void
  isFullScreen?: boolean
}

export function SearchResults({ results, onResultClick, isFullScreen = false }: SearchResultsProps) {
  console.log('SearchResults: Rendering with', {
    resultCount: results.length,
    isFullScreen
  })

  const handleResultClick = (messageId: string) => {
    console.log('SearchResults: Result clicked', { messageId })
    onResultClick(messageId)
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        No results found
      </div>
    )
  }

  return (
    <div className={`${isFullScreen ? 'h-full overflow-y-auto' : ''}`}>
      {isFullScreen && (
        <div className="px-4 py-3 border-b">
          <h2 className="text-lg font-semibold">Search Results</h2>
          <p className="text-sm text-gray-500">{results.length} results found</p>
        </div>
      )}
      <div className={`${isFullScreen ? 'divide-y' : 'space-y-2'}`}>
        {results.map((result) => (
          <div
            key={result.id}
            className={`
              p-4 hover:bg-gray-50 cursor-pointer
              ${isFullScreen ? '' : 'rounded-lg border'}
            `}
            onClick={() => handleResultClick(result.id)}
          >
            <div className="flex items-center space-x-3 mb-2">
              <UserAvatar
                src={result.user.image || undefined}
                alt={result.user.name || 'Unknown User'}
                size={32}
              />
              <div>
                <div className="font-medium">{result.user.name}</div>
                <div className="text-sm text-gray-500">
                  {formatDistanceToNow(new Date(result.createdAt), { addSuffix: true })}
                </div>
              </div>
            </div>
            <div className="text-gray-900">{result.content}</div>
            {result.thread && result.thread.messageCount > 0 && (
              <div className="mt-2 text-sm text-gray-500 flex items-center">
                <MessageSquare className="w-4 h-4 mr-1" />
                {result.thread.messageCount} {result.thread.messageCount === 1 ? 'reply' : 'replies'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
} 