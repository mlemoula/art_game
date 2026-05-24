import { NextRequest, NextResponse } from 'next/server'

const BREVO_API_URL = 'https://api.brevo.com/v3/contacts'

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const listId = process.env.BREVO_REMINDER_LIST_ID
  if (!apiKey || !listId) {
    console.error('subscribe: missing BREVO_API_KEY or BREVO_REMINDER_LIST_ID')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const listIdNumber = Number.parseInt(listId, 10)
  if (Number.isNaN(listIdNumber)) {
    console.error('subscribe: BREVO_REMINDER_LIST_ID is not a number')
    return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 })
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [listIdNumber],
        updateEnabled: true,
      }),
    })

    // 201 = contact created, 204 = already existed and updated → both are success
    if (response.status === 201 || response.status === 204) {
      return NextResponse.json({ success: true })
    }

    const payload = await response.json().catch(() => null)
    console.error('subscribe: Brevo error', response.status, payload)
    return NextResponse.json({ error: 'Could not subscribe' }, { status: 502 })
  } catch (error) {
    console.error('subscribe: fetch failed', error)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
