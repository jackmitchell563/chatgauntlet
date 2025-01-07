import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request })
  const { pathname } = request.nextUrl

  // Allow public routes
  if (
    pathname.startsWith('/_next') || // Static files
    pathname.startsWith('/api/auth') || // Auth API routes only
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup')
  ) {
    return NextResponse.next()
  }

  // Redirect unauthenticated users to login
  if (!token) {
    const url = new URL('/login', request.url)
    url.searchParams.set('callbackUrl', encodeURI(pathname))
    return NextResponse.redirect(url)
  }

  // If user is authenticated but trying to access login/signup pages,
  // redirect to workspace selection
  if (pathname === '/login' || pathname === '/signup') {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  // If user is authenticated and on the home page,
  // redirect to workspace selection
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/workspaces', request.url))
  }

  // Allow access to workspace selection page
  if (pathname === '/workspaces') {
    return NextResponse.next()
  }

  // For workspace-specific routes, ensure the format is correct
  if (pathname.startsWith('/workspace/')) {
    const workspaceId = pathname.split('/')[2]
    if (!workspaceId) {
      return NextResponse.redirect(new URL('/workspaces', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
} 