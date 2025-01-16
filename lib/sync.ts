import { PrismaClient } from '@prisma/client';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PineconeStore } from '@langchain/pinecone';

const prisma = new PrismaClient();

interface MessageVector {
  id: string;
  content: string;
  metadata: {
    channelId: string;
    userId: string;
    createdAt: string;
    workspaceId: string;
    isAiResponse: boolean;
  }
}

export async function initPinecone() {
  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY!
  });

  return pc.index(process.env.PINECONE_INDEX_TWO!);
}

export async function getMessagesForSync(lastSyncTime?: Date) {
  const where = lastSyncTime ? {
    OR: [
      { createdAt: { gt: lastSyncTime } },
      { updatedAt: { gt: lastSyncTime } },
      { deletedAt: { gt: lastSyncTime } }
    ]
  } : {};

  return prisma.message.findMany({
    where,
    include: {
      channel: {
        select: {
          workspaceId: true
        }
      }
    }
  });
}

export async function syncMessagesToPinecone(messages: Awaited<ReturnType<typeof getMessagesForSync>>) {
  const pineconeIndex = await initPinecone();
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY
  });

  // Prepare vectors for non-deleted messages
  const vectors: MessageVector[] = messages
    .filter(msg => !msg.deleted)
    .map(msg => ({
      id: msg.id,
      content: msg.content,
      metadata: {
        channelId: msg.channelId,
        userId: msg.userId,
        createdAt: msg.createdAt.toISOString(),
        workspaceId: msg.channel.workspaceId,
        isAiResponse: msg.isAiResponse || false
      }
    }));

  if (vectors.length > 0) {
    // Generate embeddings for all messages
    const documentEmbeddings = await embeddings.embedDocuments(
      vectors.map(vec => vec.content)
    );

    // Prepare vectors for Pinecone
    const pineconeVectors = vectors.map((vec, i) => ({
      id: vec.id,
      values: documentEmbeddings[i],
      metadata: {
        ...vec.metadata,
        text: vec.content
      }
    }));

    // Upsert vectors to Pinecone
    await pineconeIndex.upsert(pineconeVectors);
  }

  // Delete vectors for deleted messages
  const deletedMessageIds = messages
    .filter(msg => msg.deleted)
    .map(msg => msg.id);

  if (deletedMessageIds.length > 0) {
    await pineconeIndex.deleteMany(deletedMessageIds);
  }

  return {
    vectorized: vectors.length,
    deleted: deletedMessageIds.length
  };
}

export async function fullSync() {
  console.log('Starting full sync...');
  const messages = await getMessagesForSync();
  const result = await syncMessagesToPinecone(messages);
  console.log('Sync complete:', result);
  return result;
}

export async function incrementalSync(lastSyncTime: Date) {
  console.log('Starting incremental sync from:', lastSyncTime);
  const messages = await getMessagesForSync(lastSyncTime);
  const result = await syncMessagesToPinecone(messages);
  console.log('Incremental sync complete:', result);
  return result;
} 