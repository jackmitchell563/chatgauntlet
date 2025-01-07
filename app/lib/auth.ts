import { signOut as nextAuthSignOut, SignOutParams } from 'next-auth/react'

// Declare the global variable
declare global {
  var isPollingEnabled: boolean
}

// Initialize the global variable
globalThis.isPollingEnabled = true

export async function signOut(options?: SignOutParams) {
  // Stop polling before signing out
  globalThis.isPollingEnabled = false
  
  try {
    // Wait for the signOut to complete before redirecting
    await nextAuthSignOut(options)
  } catch (error) {
    console.error('Error during sign out:', error)
    // Still redirect on error to avoid leaving user stuck
    if (options?.callbackUrl && typeof window !== 'undefined') {
      window.location.href = options.callbackUrl
    }
  }
} 