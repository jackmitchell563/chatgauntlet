import { NextResponse } from 'next/server';
import { resolvePendingResponse } from './pending-responses';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { talk_id, status, result_url } = body;

    console.log('D-ID Webhook received:', { talk_id, status, result_url });

    if (status === 'done' && result_url) {
      resolvePendingResponse(talk_id, result_url);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in D-ID webhook:', error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
} 