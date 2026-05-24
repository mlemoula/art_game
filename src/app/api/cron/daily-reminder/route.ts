import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { getTodayDateKey } from '@/lib/dateUtils'
import { APP_BASE_URL } from '@/app/metadata'

const BREVO_CAMPAIGNS_URL = 'https://api.brevo.com/v3/emailCampaigns'
const SENDER_NAME = 'Who Painted This?'
const SENDER_EMAIL = 'who.painted.this@signalbeat.studio'

const buildEmailHtml = ({
  puzzleUrl,
  ogImageUrl,
  dateLabel,
}: {
  puzzleUrl: string
  ogImageUrl: string
  dateLabel: string
}) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Today's painting is waiting</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Courier New',Courier,monospace;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:400px;">

          <tr>
            <td style="padding-bottom:16px;text-align:center;">
              <p style="margin:0;font-size:9px;letter-spacing:0.35em;text-transform:uppercase;color:#9ca3af;">Who Painted This? &middot; ${dateLabel}</p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px 12px 0;">
                    <a href="${puzzleUrl}" style="display:block;text-decoration:none;">
                      <img
                        src="${ogImageUrl}"
                        alt="Today's painting — can you guess the artist?"
                        width="376"
                        style="width:100%;height:auto;display:block;border-radius:8px;"
                      >
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px 8px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;line-height:1.3;">A new painting is waiting.</p>
                    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">Can you guess the artist in 5 tries?</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 24px 28px;text-align:center;">
                    <a
                      href="${puzzleUrl}"
                      style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-size:10px;font-family:'Courier New',Courier,monospace;letter-spacing:0.25em;text-transform:uppercase;padding:13px 32px;border-radius:999px;"
                    >Play now &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 0 0;text-align:center;">
              <p style="margin:0;font-size:10px;color:#d1d5db;">
                <a href="{UNSUBSCRIBE_LINK}" style="color:#d1d5db;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

export async function GET(request: NextRequest) {
  // Vercel cron protection
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.BREVO_API_KEY
  const listId = process.env.BREVO_REMINDER_LIST_ID
  if (!apiKey || !listId) {
    console.error('daily-reminder: missing env vars')
    return NextResponse.json({ error: 'Misconfigured' }, { status: 503 })
  }

  const listIdNumber = Number.parseInt(listId, 10)
  if (Number.isNaN(listIdNumber)) {
    return NextResponse.json({ error: 'BREVO_REMINDER_LIST_ID must be a number' }, { status: 503 })
  }

  const today = getTodayDateKey()

  // Fetch today's artwork (just to confirm it exists — image URL comes from OG route)
  const { data: artwork, error } = await supabase
    .from('daily_art')
    .select('id, date')
    .eq('date', today)
    .maybeSingle()

  if (error || !artwork) {
    console.error('daily-reminder: no artwork for today', today, error)
    return NextResponse.json({ error: 'No artwork for today' }, { status: 404 })
  }

  const appUrl = APP_BASE_URL
  const puzzleUrl = `${appUrl}/?utm_source=email&utm_medium=daily_reminder`
  const ogImageUrl = `${appUrl}/api/share/og-image`

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${today}T12:00:00Z`))

  const htmlContent = buildEmailHtml({ puzzleUrl, ogImageUrl, dateLabel })

  try {
    // 1 — Create the campaign
    const createRes = await fetch(BREVO_CAMPAIGNS_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        name: `Daily Reminder – ${today}`,
        subject: `🎨 A new painting is waiting for you`,
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        type: 'classic',
        htmlContent,
        recipients: { listIds: [listIdNumber] },
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => null)
      console.error('daily-reminder: campaign creation failed', createRes.status, err)
      return NextResponse.json({ error: 'Campaign creation failed', detail: err }, { status: 502 })
    }

    const { id: campaignId } = (await createRes.json()) as { id: number }

    // 2 — Send immediately
    const sendRes = await fetch(`${BREVO_CAMPAIGNS_URL}/${campaignId}/sendNow`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
      },
    })

    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => null)
      console.error('daily-reminder: send failed', sendRes.status, err)
      return NextResponse.json({ error: 'Send failed', detail: err }, { status: 502 })
    }

    console.log(`daily-reminder: campaign ${campaignId} sent for ${today}`)
    return NextResponse.json({ success: true, campaignId, date: today })
  } catch (error) {
    console.error('daily-reminder: unexpected error', error)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
