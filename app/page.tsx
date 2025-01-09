'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function Home() {
  const router = useRouter()
  const { status } = useSession()

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/workspaces')
    } else if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  // Return null or a loading state while redirecting
  return null
}

