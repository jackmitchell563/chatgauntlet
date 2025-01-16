import { NextResponse } from 'next/server';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import { initPinecone } from '@/lib/sync';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';

// RAG Fusion query generation prompt
const prompt = new PromptTemplate({
  template: `Given a user question, generate multiple search queries to find both similar questions AND their answers. For each aspect of the question:
1. Generate a query to find similar questions
2. Generate a query to find potential answers
3. Rephrase the query to focus on the topic/subject matter

Example:
Question: "What's my favorite food?"
Queries:
- What's my favorite food
- I love eating [food]
- My preferred food is
- Food preferences
- Meals I enjoy the most
- Dishes I frequently eat

Question: {question}
Queries:`,
  inputVariables: ["question"],
});

// Generate queries function
async function generateQueries(input: string): Promise<string[]> {
  console.log('Generating queries for input:', input);
  const llm = new ChatOpenAI({ 
    temperature: 0,
    modelName: "gpt-4o-mini"
  });
  const outputParser = new StringOutputParser();
  
  const chain = prompt.pipe(llm).pipe(outputParser);
  const result = await chain.invoke({ question: input });
  console.log('Generated queries:', result);
  return result.split('\n').filter(q => q.trim());
}

// Reciprocal Rank Fusion implementation
interface ScoredDocument {
  document: Document;
  score: number;
}

function reciprocalRankFusion(results: Document[][], k: number = 60): ScoredDocument[] {
  const fusedScores = new Map<string, number>();
  const seenDocuments = new Map<string, Document>();
  
  // Use document ID as the key for deduplication
  for (const docs of results) {
    docs.forEach((doc, rank) => {
      const id = doc.metadata?.id || doc.pageContent;
      const previousScore = fusedScores.get(id) || 0;
      fusedScores.set(id, previousScore + 1 / (rank + k));
      if (!seenDocuments.has(id)) {
        seenDocuments.set(id, doc);
      }
    });
  }
  
  const rerankedResults: ScoredDocument[] = Array.from(fusedScores.entries())
    .map(([id, score]) => ({
      document: seenDocuments.get(id)!,
      score
    }))
    .sort((a, b) => b.score - a.score);
  
  return rerankedResults;
}

// Context prompt template
const contextPromptTemplate = new PromptTemplate({
  template: `You are an AI assistant tasked with responding in a way that mimics the writing style of the user. The provided context contains messages written by this user. 

First, analyze their writing style:
- Vocabulary choices
- Sentence structure
- Message length
- Tone and formality level
- Use of punctuation and formatting

Then, analyze the context messages to distinguish between:
1. Questions the user has asked (less relevant)
2. Statements and responses the user has made (more relevant)
3. Personal preferences and opinions expressed (most relevant)

Focus primarily on the user's statements and expressions of preference rather than their questions when formulating your response.

User Question: {query}

Context (Previous messages by this user):
{context}

Respond to the question while:
1. Using the most relevant information from their statements and preferences
2. Carefully mimicking their writing style
3. Maintaining their typical message length and tone`,
  inputVariables: ["query", "context"]
});

// Function to format documents into a string for context
function formatDocumentsForContext(documents: ScoredDocument[]): string {
  // Analyze each document to determine if it's a question or statement
  const analyzedDocs = documents.map(doc => {
    const content = doc.document.pageContent;
    const isQuestion = content.trim().endsWith('?') || 
                      content.toLowerCase().startsWith('what') ||
                      content.toLowerCase().startsWith('who') ||
                      content.toLowerCase().startsWith('where') ||
                      content.toLowerCase().startsWith('when') ||
                      content.toLowerCase().startsWith('why') ||
                      content.toLowerCase().startsWith('how');
    
    // Adjust score based on document type
    const adjustedScore = isQuestion ? doc.score * 0.7 : doc.score * 1.2;
    
    return {
      content,
      score: adjustedScore,
      type: isQuestion ? 'question' : 'statement'
    };
  });

  // Sort by adjusted scores
  analyzedDocs.sort((a, b) => b.score - a.score);

  // Format the context string with type labels
  return analyzedDocs
    .map(doc => `Message Type: ${doc.type}\nContent: ${doc.content}\nRelevance Score: ${doc.score.toFixed(4)}\n`)
    .join('\n');
}

// Main RAG pipeline
async function ragPipeline(query: string, userId: string) {
  console.log('Starting RAG pipeline with query:', query);
  console.log('Filtering for userId:', userId);
  
  const pineconeIndex = await initPinecone();
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY
  });
  
  const vectorStore = new PineconeStore(embeddings, { pineconeIndex });
  console.log('Vector store initialized');
  const retriever = vectorStore.asRetriever({
    filter: {
      userId: userId,
      isAiResponse: { $ne: true }
    }
  });
  
  // Generate multiple queries
  console.log('Generating multiple queries...');
  const queries = await generateQueries(query);
  console.log('Generated queries:', queries);
  
  // Retrieve documents for each query
  console.log('Retrieving documents for each query...');
  const retrievalResults = await Promise.all(
    queries.map(q => retriever.getRelevantDocuments(q))
  );
  console.log('Retrieved documents for all queries');
  
  // Apply reciprocal rank fusion
  console.log('Applying reciprocal rank fusion...');
  const rerankedResults = reciprocalRankFusion(retrievalResults);
  console.log('Fusion complete');
  
  // Log ranked documents
  console.log('\nRanked relevant documents:');
  rerankedResults.forEach((doc, index) => {
    console.log(`\n${index + 1}. Score: ${doc.score.toFixed(4)}`);
    console.log(`Content: ${doc.document.pageContent}`);
    console.log(`Metadata: ${JSON.stringify(doc.document.metadata, null, 2)}`);
  });
  console.log('\n');
  
  return rerankedResults;
}

// Function to get AI response with context
async function getAIResponseWithContext(query: string, context: string): Promise<string> {
  const llm = new ChatOpenAI({
    temperature: 0.7,
    modelName: "gpt-4o-mini"
  });
  
  // Create the prompt with context
  const promptWithContext = await contextPromptTemplate.invoke({
    query,
    context
  });
  
  // Get response from OpenAI
  const response = await llm.invoke(promptWithContext.toString());
  if (typeof response.content === 'string') {
    return response.content;
  } else if (Array.isArray(response.content)) {
    return response.content.map(item => {
      if ('text' in item) {
        return item.text;
      }
      return '';
    }).join(' ');
  }
  return '';
}

export async function POST(
  req: Request,
  { params }: { params: { channelId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get relevant documents using RAG pipeline
    const rankedDocs = await ragPipeline(message, session.user.id);
    console.log('Retrieved and ranked relevant documents');
    
    // Format documents for context
    const context = formatDocumentsForContext(rankedDocs);
    console.log('Formatted context from documents');
    
    // Get AI response with context
    console.log('Getting AI response...');
    const aiResponse = await getAIResponseWithContext(message, context);
    console.log('Received AI response');
    
    return NextResponse.json({ 
      response: aiResponse,
      context: rankedDocs.map(doc => ({
        content: doc.document.pageContent,
        metadata: doc.document.metadata,
        score: doc.score
      }))
    });
  } catch (error) {
    console.error('Error in RAG endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process message' },
      { status: 500 }
    );
  }
} 