import { hash } from "bcryptjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/app/lib/prisma"

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters")
})

export async function POST(req: Request) {
  try {
    const json = await req.json()
    console.log('Register request received:', { ...json, password: '[REDACTED]' })
    
    const body = registerSchema.parse(json)

    const exists = await prisma.user.findUnique({
      where: {
        email: body.email
      }
    })

    if (exists) {
      console.log('User already exists:', body.email)
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: await hash(body.password, 10)
      }
    })

    console.log('User created successfully:', { name: user.name, email: user.email })

    return NextResponse.json({
      user: {
        name: user.name,
        email: user.email
      }
    })
  } catch (error) {
    console.error('Error in register route:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }

    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
} 