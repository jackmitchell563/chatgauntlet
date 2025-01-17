import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/options';

// D-ID API configuration
const DID_API_URL = 'https://api.d-id.com';
const DID_USERNAME = process.env.DID_USERNAME;
const DID_PASSWORD = process.env.DID_PASSWORD;
const WEBHOOK_URL = 'https://chatgauntlet.onrender.com/api/webhook/d-id';

if (!DID_USERNAME || !DID_PASSWORD) {
  console.error('D-ID credentials not configured');
}

// Create a talk (video generation request)
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, source_url } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    // Prepare request to D-ID API
    const didResponse = await fetch(`${DID_API_URL}/talks`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${DID_USERNAME}:${DID_PASSWORD}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        script: {
          type: 'text',
          input: text
        },
        source_url: source_url || '/icons/defaultavatar.png',
        webhook: WEBHOOK_URL
      })
    });

    if (!didResponse.ok) {
      const error = await didResponse.json();
      console.error('D-ID API error:', error);
      return NextResponse.json(
        { error: 'Failed to create video' },
        { status: didResponse.status }
      );
    }

    const data = await didResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in D-ID talks endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Get talk status and result
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const talkId = searchParams.get('id');
    
    if (!talkId) {
      return NextResponse.json({ error: 'Talk ID is required' }, { status: 400 });
    }

    const didResponse = await fetch(`${DID_API_URL}/talks/${talkId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${DID_USERNAME}:${DID_PASSWORD}`).toString('base64')}`,
        'Accept': 'application/json'
      }
    });

    if (!didResponse.ok) {
      const error = await didResponse.json();
      console.error('D-ID API error:', error);
      return NextResponse.json(
        { error: 'Failed to get video status' },
        { status: didResponse.status }
      );
    }

    const data = await didResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in D-ID talks status endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to get video status' },
      { status: 500 }
    );
  }
} 