import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/options'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import crypto from 'crypto'

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return new NextResponse(
      JSON.stringify({ error: 'You must be logged in' }),
      { status: 401 }
    )
  }

  try {
    const { filename, contentType, size } = await request.json()

    if (!filename || !contentType || !size) {
      return new NextResponse(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400 }
      )
    }

    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return new NextResponse(
        JSON.stringify({ error: 'File type not allowed' }),
        { status: 400 }
      )
    }

    if (size > MAX_FILE_SIZE) {
      return new NextResponse(
        JSON.stringify({ error: 'File too large' }),
        { status: 400 }
      )
    }

    // Generate a unique key for the file
    const fileExtension = filename.split('.').pop()
    const randomString = crypto.randomBytes(16).toString('hex')
    const key = `uploads/${session.user.id}/${randomString}.${fileExtension}`

    // Create the PutObject command
    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    })

    // Generate a pre-signed URL for the upload
    const presignedUrl = await getSignedUrl(s3Client, putObjectCommand, { expiresIn: 3600 })

    // Return the pre-signed URL and the file key
    return new NextResponse(JSON.stringify({
      uploadUrl: presignedUrl,
      fileKey: key,
      url: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    }))
  } catch (error) {
    console.error('Error handling file upload:', error)
    return new NextResponse(
      JSON.stringify({ error: 'Failed to process file upload' }),
      { status: 500 }
    )
  }
} 