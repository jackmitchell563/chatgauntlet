import { NextResponse } from 'next/server';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { Document } from '@langchain/core/documents';
import { initPinecone } from '@/lib/sync';

// RAG Fusion query generation prompt
const prompt = new PromptTemplate({
  template: `Given a user question, generate multiple search queries that capture different aspects of the question.
Question: {question}
Queries:`,
  inputVariables: ["question"],
});

// Generate queries function
async function generateQueries(input: string): Promise<string[]> {
  console.log('Generating queries for input:', input);
  const llm = new ChatOpenAI({ 
    temperature: 0,
    modelName: "gpt-4-turbo-preview"
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
  template: `You are a helpful AI assistant in a chat application. Use the provided context from previous messages to help answer the user's question. Keep your response concise and natural, as if you're having a conversation.

User Question: {query}

Context from chat history:
{context}

Assistant Response:`,
  inputVariables: ["query", "context"]
});

// Function to format documents into a string for context
function formatDocumentsForContext(documents: ScoredDocument[]): string {
  return documents
    .map(doc => `Message: ${doc.document.pageContent}\nRelevance Score: ${doc.score}\n`)
    .join('\n');
}

// Main RAG pipeline
async function ragPipeline(query: string) {
  console.log('Starting RAG pipeline with query:', query);
  
  const pineconeIndex = await initPinecone();
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY
  });
  
  const vectorStore = new PineconeStore(embeddings, { pineconeIndex });
  console.log('Vector store initialized');
  const retriever = vectorStore.asRetriever();
  
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
  
  return rerankedResults;
}

// Function to get AI response with context
async function getAIResponseWithContext(query: string, context: string): Promise<string> {
  const llm = new ChatOpenAI({
    temperature: 0.7,
    modelName: "gpt-4-turbo-preview"
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
    const { message } = await req.json();
    
    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Get relevant documents using RAG pipeline
    const rankedDocs = await ragPipeline(message);
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