# AI Response System Documentation

## Overview
The application implements an AI response system using RAG (Retrieval Augmented Generation) with GPT-4o-mini. Messages from AI are marked with `isAiResponse: true` and receive special UI treatment.

## Core Components

### 1. Message Interface
```typescript
interface Message {
  // ... other fields
  isAiResponse?: boolean  // Marks messages as AI-generated
}
```

### 2. Database Schema
- Table: `Message`
- Relevant Field: `isAiResponse BOOLEAN NOT NULL DEFAULT false`

### 3. UI Components

#### MessageArea (`app/components/MessageArea.tsx`)
- **State Management**:
  ```typescript
  const [isAiEnabled, setIsAiEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  ```
- **Key Functions**:
  - `handleSendMessage()`: Manages message sending flow
  - AI Toggle Button: Lines 1381-1396
  - AI Response Flow: Lines 576-646

#### MessageItem (`app/components/MessageItem.tsx`)
- Handles message display
- Special formatting for AI messages:
  - Custom avatar (/icons/robot.svg)
  - Blue text color
  - "AI Bot" username display

### 4. API Endpoints

#### RAG Endpoint (`/api/channels/[channelId]/rag`)
```typescript
POST /api/channels/${channelId}/rag
Body: { message: string }
Response: {
  response: string,
  context: {
    content: string,
    metadata: any,
    score: number
  }[]
}
```

#### Message Creation (`/api/channels/${channelId}/messages`)
```typescript
POST /api/channels/${channelId}/messages
Body: {
  content: string,
  attachments?: Attachment[],
  isAiResponse?: boolean
}
Returns: Message
```

## Message Flow
1. User sends message with AI enabled:
   ```
   User Message → RAG Processing → AI Response
   ```
2. System creates two messages:
   - Original user message (`isAiResponse: false`)
   - AI response message (`isAiResponse: true`)

## Known Issues
- UI can get stuck in "getting ai response" state when switching channels
- Loading states need better handling

## Current Visual Differentiation
- AI messages use:
  - Robot avatar
  - Blue text color
  - "AI Bot" display name
  - Special metadata flag

## Implementation Details

### RAG Pipeline
```typescript
async function getAIResponseWithContext(query: string, context: string): Promise<string> {
  const llm = new ChatOpenAI({
    temperature: 0.7,
    modelName: "gpt-4o-mini"
  });
  
  // Create prompt with context
  const promptWithContext = await contextPromptTemplate.invoke({
    query,
    context
  });
  
  // Get response from OpenAI
  const response = await llm.invoke(promptWithContext.toString());
  return response.content;
}
```

### Message Sending Flow
1. User types message
2. If AI enabled:
   - Send user message
   - Call RAG endpoint
   - Create AI response message
3. Update UI with both messages
4. Handle loading states

## Security Considerations
- AI responses are treated as system messages
- User permissions still apply to viewing messages
- API endpoints require authentication 