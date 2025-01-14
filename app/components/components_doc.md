# Components Documentation

This document provides a comprehensive overview of the components used in the application, their functionality, and their interactions.

## Core Data Structures

### Message
```typescript
interface Message {
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
  parentMessageId?: string | null
  attachments?: {
    id: string
    name: string
    type: string
    url: string
    size: number
  }[]
  isAiResponse?: boolean
}
```

### ThreadState
```typescript
interface ThreadState {
  rootMessage: Message
  messages: Message[]
}
```

## Component Details

### MessageArea (`MessageArea.tsx`)

The main messaging interface component that handles message display, sending, and AI interactions.

**State:**
```typescript
const [newMessage, setNewMessage] = useState('')
const [messages, setMessages] = useState<Message[]>([])
const [isLoading, setIsLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
const [activeThread, setActiveThread] = useState<ThreadState | null>(null)
const [threadMessages, setThreadMessages] = useState<{ [threadId: string]: Message[] }>({})
const [openEmojiPickerId, setOpenEmojiPickerId] = useState<string | null>(null)
const [uploadingFiles, setUploadingFiles] = useState<{ [key: string]: { progress: number; name: string } }>({})
const [stagedAttachments, setStagedAttachments] = useState<{
  name: string;
  type: string;
  url: string;
  size: number;
}[]>([])
const [isAiEnabled, setIsAiEnabled] = useState(false)
```

**Refs:**
```typescript
const inputRef = useRef<HTMLInputElement>(null)
const fileInputRef = useRef<HTMLInputElement>(null)
const messageContainerRef = useRef<HTMLDivElement>(null)
const sseConnectionRef = useRef<EventSource | null>(null)
const pendingScrollToMessageId = useRef<string | null>(null)
```

**Key Functions:**
```typescript
// Message Handling
async function handleSendMessage(): Promise<void>
// Sends message and handles AI response if enabled
// Manages loading states and error handling

async function handleAddReaction(messageId: string, emoji: { native: string }): Promise<void>
// Adds/toggles emoji reactions on messages
// Updates both main messages and thread messages if needed

async function handleOpenThread(messageId: string): Promise<void>
// Opens thread view for a message
// Fetches thread messages and manages thread state

async function handleSendThreadMessage(content: string): Promise<void>
// Sends messages within a thread
// Updates thread counts and message lists

// File Handling
async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>): Promise<void>
// Handles file uploads
// Manages upload progress and staged attachments

function removeStagedAttachment(index: number): void
// Removes files before sending

// Search and Navigation
async function handleSearchResultClick(messageId: string): Promise<void>
// Handles navigation to search results
// Manages scroll behavior and thread opening
```

**SSE Event Handling:**
```typescript
// Event Types
type MessageEvent = {
  type: 'NEW_MESSAGE' | 'MESSAGE_UPDATED' | 'MESSAGE_DELETED'
  message?: Message
  messageId?: string
}

type ReactionEvent = {
  type: 'REACTION_ADDED' | 'REACTION_REMOVED'
  messageId: string
  reactions: Message['reactions']
}

type ThreadEvent = {
  type: 'THREAD_MESSAGE_ADDED' | 'THREAD_UPDATED'
  threadId: string
  message?: Message
  messages: Message[]
  messageCount: number
}

// Connection Management
function setupSSE(): void
// Establishes SSE connection
// Handles reconnection with exponential backoff
// Processes different event types
```

### ThreadView (`ThreadView.tsx`)

**Props Interface:**
```typescript
interface ThreadViewProps {
  rootMessage: ThreadMessage
  messages: ThreadMessage[]
  onClose: () => void
  onSendMessage: (content: string) => void
  onAddReaction: (messageId: string, emoji: { native: string }) => void
  openTimestamp: number
  pendingScrollToMessageId?: string | null
  onScrollComplete?: () => void
}
```

**Key Functions:**
```typescript
function formatMessageDate(date: Date): string
// Formats message timestamps with relative time

function renderReactions(messageId: string, reactions: Message['reactions']): JSX.Element
// Renders reaction buttons with counts and tooltips

function handleSendMessage(): Promise<void>
// Sends messages in thread context
```

### SearchResults (`SearchResults.tsx`)

**Props and Types:**
```typescript
interface SearchResultsProps {
  results: SearchResult[]
  onResultClick: (messageId: string) => void
  isFullScreen?: boolean
}

interface SearchResult extends Message {
  score?: number  // Added by RAG search
}
```

## API Endpoints

### Messages
```typescript
// GET /api/channels/${channelId}/messages
// Returns Message[]

// POST /api/channels/${channelId}/messages
// Body: { content: string, attachments?: Attachment[], isAiResponse?: boolean }
// Returns: Message

// GET /api/messages/${messageId}/thread
// Returns: { messages: Message[] }

// POST /api/messages/${messageId}/thread
// Body: { content: string }
// Returns: Message
```

### RAG/AI
```typescript
// POST /api/channels/${channelId}/rag
// Body: { message: string }
// Returns: {
//   response: string,
//   context: {
//     content: string,
//     metadata: any,
//     score: number
//   }[]
// }
```

### Real-time Events
```typescript
// GET /api/channels/${channelId}/events
// SSE Endpoint
// Events:
//   - message.new: { type: 'NEW_MESSAGE', message: Message }
//   - message.updated: { type: 'MESSAGE_UPDATED', message: Message }
//   - message.deleted: { type: 'MESSAGE_DELETED', messageId: string }
//   - reaction.added: { type: 'REACTION_ADDED', messageId: string, reactions: Reaction[] }
//   - reaction.removed: { type: 'REACTION_REMOVED', messageId: string, reactions: Reaction[] }
//   - thread.message.added: { type: 'THREAD_MESSAGE_ADDED', threadId: string, message: Message, messages: Message[] }
//   - thread.updated: { type: 'THREAD_UPDATED', threadId: string, messageCount: number }
```

## Database Schema (Prisma)

```prisma
model Message {
  id          String     @id @default(cuid())
  content     String     @db.Text
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  channelId   String
  userId      String
  edited      Boolean    @default(false)
  deleted     Boolean    @default(false)
  deletedAt   DateTime?
  isAiResponse Boolean   @default(false)
  
  // Relations
  channel     Channel    @relation(fields: [channelId], references: [id], onDelete: Cascade)
  user        User       @relation(fields: [userId], references: [id])
  reactions   Reaction[]
  attachments Attachment[]
  
  // Thread fields
  thread      Thread?    @relation("ThreadRoot")
  threadId    String?    @unique
  threadReplies Message[] @relation("ThreadReplies")
  parentMessage Message? @relation("ThreadReplies", fields: [parentMessageId], references: [id])
  parentMessageId String?

  @@index([channelId, createdAt(sort: Desc)])
  @@index([userId])
  @@index([threadId])
  @@index([parentMessageId])
}
```

## Vector Store Integration (Pinecone)

**Message Vector Format:**
```typescript
interface MessageVector {
  id: string
  content: string
  metadata: {
    channelId: string
    userId: string
    createdAt: string
    workspaceId: string
  }
}
```

**Sync Functions:**
```typescript
// In lib/sync.ts
async function initPinecone(): Promise<any>
// Initializes Pinecone connection

async function getMessagesForSync(lastSyncTime?: Date): Promise<Message[]>
// Retrieves messages that need syncing

async function syncMessagesToPinecone(messages: Message[]): Promise<{
  vectorized: number
  deleted: number
}>
// Syncs messages with Pinecone
// Handles both new/updated messages and deletions

async function fullSync(): Promise<{ vectorized: number; deleted: number }>
// Performs full database sync

async function incrementalSync(lastSyncTime: Date): Promise<{
  vectorized: number
  deleted: number
}>
// Performs incremental sync from last sync time
``` 