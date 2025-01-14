// import { config } from 'dotenv';
// import { OpenAIEmbeddings } from '@langchain/openai';
// import { PineconeStore } from '@langchain/pinecone';
// import { ChatOpenAI } from '@langchain/openai';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { StringOutputParser } from '@langchain/core/output_parsers';
// import { Document } from '@langchain/core/documents';
// import { Pinecone } from '@pinecone-database/pinecone';

// // Load environment variables
// config();

// console.log('Starting application...');
// console.log('Environment variables loaded');

// // Set environment variables
// let pc: Pinecone;
// let pineconeIndex: any;

// async function testPineconeConnection() {
//     try {
//         console.log('Testing Pinecone connection...');
//         const description = await pineconeIndex.describeIndexStats();
//         console.log('Pinecone index stats:', JSON.stringify(description, null, 2));
//         return true;
//     } catch (error) {
//         console.error('Error testing Pinecone connection:', error);
//         return false;
//     }
// }

// async function initializePinecone() {
//     try {
//         console.log('Initializing Pinecone...');
//         const apiKey = process.env.PINECONE_API_KEY;
//         if (!apiKey) throw new Error('PINECONE_API_KEY is not set');
        
//         pc = new Pinecone({
//             apiKey
//         });
//         console.log('Pinecone client created');
        
//         const indexName = process.env.PINECONE_INDEX_TWO;
//         if (!indexName) throw new Error('PINECONE_INDEX_TWO is not set');
        
//         pineconeIndex = pc.index(indexName);
//         console.log('Pinecone index accessed:', indexName);
        
//         // Test the connection immediately
//         const connectionSuccess = await testPineconeConnection();
//         if (!connectionSuccess) {
//             throw new Error('Failed to connect to Pinecone');
//         }
//     } catch (error) {
//         console.error('Error initializing Pinecone:', error);
//         process.exit(1);
//     }
// }

// // Define document structure
// const allDocuments: Record<string, string> = {
//     "doc1": "Climate change and economic impact.",
//     "doc2": "Public health concerns due to climate change.",
//     "doc3": "Climate change: A social perspective.",
//     "doc4": "Technological solutions to climate change.",
//     "doc5": "Policy changes needed to combat climate change.",
//     "doc6": "Climate change and its impact on biodiversity.",
//     "doc7": "Climate change: The science and models.",
//     "doc8": "Global warming: A subset of climate change.",
//     "doc9": "How climate change affects daily weather.",
//     "doc10": "The history of climate change activism.",
// };

// // Initialize vector store
// async function initVectorStore() {
//     console.log('Initializing vector store...');
//     try {
//         const openAIKey = process.env.OPENAI_API_KEY;
//         if (!openAIKey) throw new Error('OPENAI_API_KEY is not set');
        
//         const embeddings = new OpenAIEmbeddings({
//             openAIApiKey: openAIKey
//         });
//         console.log('Embeddings initialized');
        
//         // Test Pinecone connection again before proceeding
//         const connectionSuccess = await testPineconeConnection();
//         if (!connectionSuccess) {
//             throw new Error('Lost connection to Pinecone');
//         }
        
//         console.log('Creating vector store with document count:', Object.values(allDocuments).length);
        
//         // Create documents with metadata
//         const documents = Object.entries(allDocuments).map(([docId, text]) => ({
//             pageContent: text,
//             metadata: { id: docId }
//         }));
        
//         // Get embeddings for all documents
//         console.log('Generating embeddings for documents...');
//         const documentEmbeddings = await embeddings.embedDocuments(
//             documents.map(doc => doc.pageContent)
//         );
        
//         // Prepare vectors for Pinecone
//         const vectors = documents.map((doc, i) => ({
//             id: doc.metadata.id,
//             values: documentEmbeddings[i],
//             metadata: {
//                 text: doc.pageContent,
//                 id: doc.metadata.id
//             }
//         }));
        
//         // Delete all existing vectors before upserting
//         console.log('Deleting existing vectors...');
//         await pineconeIndex.deleteAll();
        
//         // Upsert vectors directly using Pinecone client
//         console.log('Upserting vectors to Pinecone...');
//         await pineconeIndex.upsert(vectors);
//         console.log('Vectors upserted successfully');
        
//         // Create and return the vector store for querying
//         const vectorStore = new PineconeStore(embeddings, { pineconeIndex });
//         return vectorStore;
//     } catch (error: any) {
//         console.error('Detailed error in initVectorStore:', {
//             name: error?.name,
//             message: error?.message,
//             stack: error?.stack,
//             cause: error?.cause
//         });
//         throw error;
//     }
// }

// // RAG Fusion query generation prompt
// const prompt = new PromptTemplate({
//     template: `Given a user question, generate multiple search queries that capture different aspects of the question.
// Question: {question}
// Queries:`,
//     inputVariables: ["question"],
// });

// // Generate queries function
// async function generateQueries(input: string): Promise<string[]> {
//     console.log('Generating queries for input:', input);
//     const llm = new ChatOpenAI({ 
//         temperature: 0,
//         modelName: "gpt-4o-mini"
//     });
//     const outputParser = new StringOutputParser();
    
//     const chain = prompt.pipe(llm).pipe(outputParser);
//     const result = await chain.invoke({ question: input });
//     console.log('Generated queries:', result);
//     return result.split('\n');
// }

// // Reciprocal Rank Fusion implementation
// interface ScoredDocument {
//     document: Document;
//     score: number;
// }

// function reciprocalRankFusion(results: Document[][], k: number = 60): ScoredDocument[] {
//     const fusedScores = new Map<string, number>();
//     const seenDocuments = new Map<string, Document>();
    
//     // Use document ID as the key for deduplication
//     for (const docs of results) {
//         docs.forEach((doc, rank) => {
//             const id = doc.metadata?.id || doc.pageContent;
//             const previousScore = fusedScores.get(id) || 0;
//             fusedScores.set(id, previousScore + 1 / (rank + k));
//             if (!seenDocuments.has(id)) {
//                 seenDocuments.set(id, doc);
//             }
//         });
//     }
    
//     const rerankedResults: ScoredDocument[] = Array.from(fusedScores.entries())
//         .map(([id, score]) => ({
//             document: seenDocuments.get(id)!,
//             score
//         }))
//         .sort((a, b) => b.score - a.score);
    
//     return rerankedResults;
// }

// // Main RAG pipeline
// async function ragPipeline(query: string) {
//     console.log('Starting RAG pipeline with query:', query);
//     const vectorStore = await initVectorStore() as PineconeStore;
//     console.log('Vector store initialized in pipeline');
//     const retriever = vectorStore.asRetriever();
    
//     // Generate multiple queries
//     console.log('Generating multiple queries...');
//     const queries = await generateQueries(query);
//     console.log('Generated queries:', queries);
    
//     // Retrieve documents for each query
//     console.log('Retrieving documents for each query...');
//     const retrievalResults = await Promise.all(
//         queries.map(q => retriever.getRelevantDocuments(q))
//     );
//     console.log('Retrieved documents for all queries');
    
//     // Apply reciprocal rank fusion
//     console.log('Applying reciprocal rank fusion...');
//     const rerankedResults = reciprocalRankFusion(retrievalResults);
//     console.log('Fusion complete');
    
//     return rerankedResults;
// }

// // Add new prompt template for adding context
// const contextPromptTemplate = new PromptTemplate({
//     template: `{query}\n\nContext from chat history:\n{context}`,
//     inputVariables: ["query", "context"]
// });

// // Function to format documents into a string for context
// function formatDocumentsForContext(documents: ScoredDocument[]): string {
//     return documents
//         .map(doc => `Message: ${doc.document.pageContent}\nRelevance Score: ${doc.score}\n`)
//         .join('\n');
// }

// // Function to get AI response with context
// async function getAIResponseWithContext(query: string, context: string): Promise<string> {
//     const llm = new ChatOpenAI({
//         temperature: 0.7,
//         modelName: "gpt-4o-mini" // Using the correct model name
//     });
    
//     // Create the prompt with context
//     const promptWithContext = await contextPromptTemplate.invoke({
//         query,
//         context
//     });
    
//     // Get response from OpenAI
//     const response = await llm.invoke(promptWithContext.toString());
//     if (typeof response.content === 'string') {
//         return response.content;
//     } else if (Array.isArray(response.content)) {
//         // If content is an array of MessageContentComplex, join their text content
//         return response.content.map(item => {
//             if ('text' in item) {
//                 return item.text;
//             }
//             return '';
//         }).join(' ');
//     }
//     // Fallback
//     return '';
// }

// // Enhanced RAG pipeline that includes AI response
// async function enhancedRagPipeline(query: string) {
//     console.log('Starting enhanced RAG pipeline with query:', query);
    
//     // Get relevant documents using existing RAG pipeline
//     const rankedDocs = await ragPipeline(query);
//     console.log('Retrieved and ranked relevant documents');
    
//     // Format documents for context
//     const context = formatDocumentsForContext(rankedDocs);
//     console.log('Formatted context from documents');
    
//     // Get AI response with context
//     console.log('Getting AI response...');
//     const aiResponse = await getAIResponseWithContext(query, context);
//     console.log('Received AI response');
    
//     return {
//         relevantDocuments: rankedDocs,
//         aiResponse
//     };
// }

// // Example usage
// async function main() {
//     console.log('Main function started');
//     await initializePinecone();
//     const originalQuery = "impact of climate change";
//     console.log('Executing enhanced RAG pipeline...');
//     const results = await enhancedRagPipeline(originalQuery);
    
//     // Format the output to be more readable
//     const formattedResults = {
//         relevantDocuments: results.relevantDocuments.map(doc => ({
//             content: doc.document.pageContent,
//             metadata: doc.document.metadata,
//             score: doc.score
//         })),
//         aiResponse: results.aiResponse
//     };
    
//     console.log('Pipeline complete. Results:', JSON.stringify(formattedResults, null, 2));
// }

// // Run main directly instead of checking require.main
// console.log('About to start main execution...');
// main().catch(error => {
//     console.error('Error in main execution:', error);
// });

// export { ragPipeline, generateQueries, reciprocalRankFusion, enhancedRagPipeline }; 