import { NextRequest, NextResponse } from 'next/server'

const BREVO_API_URL = 'https://api.brevo.com/v3/contacts'

const isValidEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

// RecallCheck waitlist. Deliberately separate from /api/subscribe: that one writes to the
// "daily painting reminder" list (BREVO_REMINDER_LIST_ID). Never fall back to that list here.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Honeypot: real users never fill the hidden "website" field. Pretend success to bots.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ success: true })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const listId = Number.parseInt(process.env.BREVO_PET_LIST_ID ?? '', 10)
  if (!apiKey || Number.isNaN(listId)) {
    console.error('pet-waitlist: missing BREVO_API_KEY or BREVO_PET_LIST_ID')
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      // listIds only adds the contact to this list; it does not remove existing memberships.
      body: JSON.stringify({ email, listIds: [listId], updateEnabled: true }),
    })

    // 201 = contact created, 204 = already existed and updated → both are success
    if (response.status === 201 || response.status === 204) {
      return NextResponse.json({ success: true })
    }

    const payload = await response.json().catch(() => null)
    console.error('pet-waitlist: Brevo error', response.status, payload)
    return NextResponse.json({ error: 'Could not subscribe' }, { status: 502 })
  } catch (error) {
    console.error('pet-waitlist: fetch failed', error)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
