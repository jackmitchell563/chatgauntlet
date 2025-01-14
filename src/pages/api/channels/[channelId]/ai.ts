// import type { NextApiRequest, NextApiResponse } from 'next'
// import { getServerSession } from 'next-auth'
// import { authOptions } from '@/app/api/auth/[...nextauth]'  // Path may vary
// import { prisma } from '@/app/lib/prisma'                       // Your Prisma client
// import { enhancedRagPipeline } from '@/path/to/rag_example' // Adjust the import path

// // Utility to find the "other user" in a DM channel (assuming channelName has the pattern "DM:userIdA-userIdB")
// async function findOtherUserInDM(channelId: string, requestingUserId: string) {
//   const channel = await prisma.channel.findUnique({
//     where: { id: channelId },
//   })
//   if (!channel) throw new Error('Channel not found')

//   // Example channel naming format: DM:userIdA-userIdB
//   // Extract user IDs and return the one that's not requestingUserId
//   const nameParts = channel.name.split(':') // ["DM", "userIdA-userIdB"]
//   if (nameParts.length < 2) return null

//   const userIds = nameParts[1].split('-') // ["userIdA", "userIdB"]
//   const otherUserId = userIds.find((id) => id !== requestingUserId)
//   return otherUserId || null
// }

// export default async function handler(req: NextApiRequest, res: NextApiResponse) {
//   try {
//     // Ensure request is POST
//     if (req.method !== 'POST') {
//       return res.status(405).json({ error: 'Method not allowed' })
//     }

//     // Check authentication
//     const session = await getServerSession(req, res, authOptions)
//     if (!session?.user?.id) {
//       return res.status(401).json({ error: 'Unauthorized' })
//     }
//     const requestingUserId = session.user.id
//     const { channelId } = req.query
//     const { userQuery } = req.body as { userQuery: string }

//     // Use your RAG pipeline
//     const ragResult = await enhancedRagPipeline(userQuery)
//     const aiText = ragResult.aiResponse || 'Unable to generate a response'

//     // Find the "other user" in the DM
//     const otherUserId = await findOtherUserInDM(channelId as string, requestingUserId)
//     if (!otherUserId) {
//       return res.status(400).json({ error: 'Not a valid DM or could not find other user' })
//     }

//     // Store the AI message as if from the other user, but flagged as AI
//     const createdMessage = await prisma.message.create({
//       data: {
//         content: aiText,
//         channelId: channelId as string,
//         userId: otherUserId,
//         // Add a custom field or metadata to indicate it's AI
//         //   e.g.: isAI: true, or store in a separate column
//         // If you prefer a separate "metadata" field in your table, do something like:
//         //   metadata: { isAI: true },
//       }
//     })

//     return res.status(200).json({
//       message: createdMessage,
//       ragInfo: ragResult.relevantDocuments,
//     })
//   } catch (error: any) {
//     console.error('AI handler error:', error)
//     return res.status(500).json({ error: error.message || 'Internal server error' })
//   }
// } 