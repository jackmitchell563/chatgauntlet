# Components Documentation

This document provides a comprehensive overview of the components used in the application, their functionality, and their interactions.

## Directory Structure

The components are located in the `app/components` directory. Here's an overview of the main components:

- `LoginForm.tsx` - Handles user authentication
- `MessageArea.tsx` - Main messaging interface
- `ThreadView.tsx` - Thread/conversation view component
- `Sidebar.tsx` - Application sidebar navigation
- `SearchResults.tsx` - Search functionality display
- `TopBar.tsx` - Top navigation bar
- `JoinWorkspaceDialog.tsx` - Workspace joining interface
- `SettingsMenu.tsx` - User settings interface
- `UserAvatar.tsx` - User avatar display component
- `ui/` - Directory containing UI utility components

## Component Details

### LoginForm (`LoginForm.tsx`)

A client-side component that handles user authentication.

**Key Features:**
- Form submission handling with email and password fields
- API integration with `/api/auth/login` endpoint
- Error handling and user feedback
- Styled with Tailwind CSS

**Props:** None (self-contained component)

**API Integration:**
- POST `/api/auth/login`
  - Request Body: `{ email: string, password: string }`
  - Response: Success message or error details

### MessageArea (`MessageArea.tsx`)

The main messaging interface component that handles message display, sending, and interactions.

**Key Features:**
- Real-time message display
- Message sending with text and attachments
- Emoji reactions
- Thread support
- File attachments
- Message search
- User status integration

**Props:**
```typescript
interface MessageAreaProps {
  channelId: string | undefined
  channelName: string | undefined
  channelType: 'channel' | 'dm' | undefined
  messages: Message[]
  onSendMessage: (content: string) => void
  onAddReaction: (messageId: string, emoji: { native: string }) => void
  registerCleanup: (cleanup: () => void) => void
  shouldScrollOnLoad?: boolean
  searchQuery?: string
  onSearchResultClick?: (messageId: string) => void
  selectedMessageId?: string | null
}
```

**Key Functions:**
- `handleSendMessage`: Processes new message submission
- `handleAddReaction`: Manages emoji reactions
- `handleOpenThread`: Opens message threads
- `handleFileSelect`: Processes file attachments
- `performSearch`: Handles message searching

**State Management:**
- Manages message polling
- Tracks user statuses
- Handles scroll position
- Manages file attachments

### ThreadView (`ThreadView.tsx`)

Component for displaying and interacting with message threads.

**Key Features:**
- Displays thread messages
- Supports message replies
- Shows user profiles
- Handles emoji reactions
- Real-time updates

**Props:**
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

**Subcomponents:**
- `UserProfile`: Displays user information and status
  ```typescript
  interface UserProfileProps {
    user: {
      id: string
      name: string | null
      image: string | null
    }
  }
  ```

**Key Functions:**
- `formatMessageDate`: Formats message timestamps
- `handleSendMessage`: Processes thread replies
- `renderReactions`: Displays message reactions
- `handleAddReaction`: Manages emoji reactions

**Integration:**
- Uses NextAuth for session management
- Integrates with workspace context for user statuses
- Uses UI components from the `ui/` directory

### SearchResults (`SearchResults.tsx`)

A component that displays search results for messages in a channel or workspace.

**Key Features:**
- Displays message search results with user information
- Shows message content and timestamps
- Indicates thread information if available
- Supports full-screen and inline display modes
- Handles result selection

**Props:**
```typescript
interface SearchResultsProps {
  results: SearchResult[]
  onResultClick: (messageId: string) => void
  isFullScreen?: boolean
}
```

**Data Structure:**
```typescript
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
```

**Key Features:**
- Empty state handling
- Responsive layout
- Thread count display
- Time formatting using `date-fns`
- User avatar integration

### Sidebar (`Sidebar.tsx`)

The main navigation component that provides access to channels, direct messages, and workspace features.

**Key Features:**
- Workspace information display
- Channel list management
- Direct messages list
- Search functionality
- User status management
- Resizable sidebar
- Section collapsing

**Props:**
```typescript
interface SidebarProps {
  workspace: {
    name: string
    logo?: string | null
  }
  channels: Channel[]
  directMessages: DirectMessage[]
  onChannelSelect: (channel: Channel) => void
  onDirectMessageSelect: (dm: DirectMessage) => void
  selectedChannelId: string | null
  width: number
  onResize: (width: number) => void
  onSearchResultClick: (messageId: string) => void
  onShowFullSearch: (query: string) => void
}
```

**Data Structures:**
```typescript
interface Channel {
  id: string
  name: string
  type: string
}

interface DirectMessage {
  id: string
  name: string
}
```

**Key Functions:**
- `handleStatusChange`: Updates user status
- `handleChannelClick`: Handles channel selection
- `toggleChannelsSection`: Collapses/expands channels list
- `toggleDmSection`: Collapses/expands DMs list
- `handleMouseDown`: Manages sidebar resizing
- `performSearch`: Handles search functionality
- `handleSearchKeyDown`: Manages search input interactions

**Integration:**
- Uses NextAuth for session management
- Integrates with workspace context
- Uses custom hooks (`useDebounce`)
- Implements real-time user status updates

### TopBar (`TopBar.tsx`)

A component that displays the channel information and provides search and settings functionality.

**Key Features:**
- Channel name display with type indicator
- Search input field
- Notifications button
- Settings menu integration

**Props:**
```typescript
interface TopBarProps {
  channelName: string | undefined
  channelType: 'channel' | 'dm' | undefined
  onThemeChange: (color: string) => void
}
```

**Integration:**
- Uses UI components from `ui/` directory
- Integrates with `SettingsMenu` component
- Implements Lucide icons

### JoinWorkspaceDialog (`JoinWorkspaceDialog.tsx`)

A dialog component that handles workspace creation and joining functionality.

**Key Features:**
- Create new workspace button
- Join existing workspace dialog
- Error handling
- Loading states
- Workspace ID validation

**Props:**
```typescript
interface JoinWorkspaceDialogProps {
  onCreateWorkspaceClick: () => void
}
```

**API Integration:**
- POST `/api/workspaces/${workspaceId}/join`
  - Handles workspace joining
  - Returns workspace data or error

**Key Functions:**
- `handleJoinWorkspace`: Processes workspace join requests
- Error state management
- Navigation after successful join

### SettingsMenu (`SettingsMenu.tsx`)

A dropdown menu component that provides theme customization and user settings.

**Key Features:**
- Theme color selection
- Sign out functionality
- Dropdown menu interface
- Color preview swatches

**Props:**
```typescript
interface SettingsMenuProps {
  onThemeChange: (color: string) => void
}
```

**Theme Options:**
```typescript
const themeColors = [
  '#1a202c', // Dark Blue Gray
  '#2d3748', // Darker Blue Gray
  '#2C3E50', // Midnight Blue
  '#34495E', // Wet Asphalt
  '#4A5568', // Gray
]
```

**Integration:**
- Uses NextAuth for sign out functionality
- Implements UI components from `ui/` directory
- Uses Lucide icons

### UserAvatar (`UserAvatar.tsx`)

A reusable component for displaying user avatars with fallback.

**Key Features:**
- Image display with fallback icon
- Customizable size
- Rounded design with border
- Responsive scaling

**Props:**
```typescript
interface UserAvatarProps {
  src?: string
  alt: string
  size?: number
}
```

**Implementation Details:**
- Uses Next.js `Image` component for optimized image loading
- Implements Lucide `User` icon as fallback
- Supports dynamic sizing
- Maintains aspect ratio
- Includes subtle border shadow for visual definition

## UI Components Directory

The `ui/` directory contains reusable UI components used throughout the application:

- `button`: Button component with various styles and variants
- `input`: Input field component
- `dialog`: Modal dialog components
- `dropdown-menu`: Dropdown menu components
- `popover`: Popover components

These components serve as the building blocks for the main components and provide consistent styling and behavior across the application.

## API Integration

Many components interact with the application's API endpoints:

1. Authentication:
   - `/api/auth/login`
   - `/api/auth/register`

2. Workspace Management:
   - `/api/workspaces/${workspaceId}/join`
   - `/api/workspaces/${workspaceId}/status`

3. Messaging:
   - `/api/messages/${messageId}`
   - `/api/messages/${messageId}/thread`

4. Search:
   - `/api/channels/${channelId}/search`

## State Management

The application uses various state management approaches:

1. Local State:
   - React's `useState` for component-level state
   - `useRef` for DOM references and persisted values

2. Session Management:
   - NextAuth for authentication state
   - Workspace context for shared workspace data

3. Custom Hooks:
   - `useDebounce` for search optimization
   - `useWorkspace` for workspace context access

## Event Handling

Components implement various event handlers for user interactions:

1. User Actions:
   - Message sending
   - Channel selection
   - Search functionality
   - Theme changes

2. UI Interactions:
   - Sidebar resizing
   - Section collapsing
   - Dialog opening/closing
   - Dropdown menu interactions

## Styling

The application uses:
- Tailwind CSS for styling
- Custom CSS for specific components
- Responsive design principles
- Consistent theme implementation 