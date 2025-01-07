import { PrismaAdapter } from "@auth/prisma-adapter"
import { compare } from "bcryptjs"
import NextAuth, { type NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/app/lib/prisma"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
    }
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  pages: {
    signIn: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        console.log('Authorize function called with credentials:', { email: credentials?.email })

        if (!credentials?.email || !credentials?.password) {
          console.log('Missing credentials')
          return null
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        console.log('User found:', user ? { ...user, password: '[REDACTED]' } : null)

        if (!user || !user.password) {
          console.log('User not found or no password')
          return null
        }

        const isPasswordValid = await compare(credentials.password, user.password)
        console.log('Password validation result:', isPasswordValid)

        if (!isPasswordValid) {
          console.log('Invalid password')
          return null
        }

        console.log('Authentication successful for user:', { id: user.id, email: user.email })
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image
        }
      }
    })
  ],
  callbacks: {
    session: ({ session, token }) => {
      console.log('Session callback:', { session, token })
      return {
        ...session,
        user: {
          ...session.user,
          id: token.sub
        }
      }
    },
    jwt: ({ token, user }) => {
      console.log('JWT callback:', { token, user })
      if (user) {
        return {
          ...token,
          id: user.id
        }
      }
      return token
    }
  }
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST } 