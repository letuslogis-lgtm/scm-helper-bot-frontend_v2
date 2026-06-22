import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://scm-helper-bot-frontend-v2.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// ── Slack 이메일 → User ID 변환 ──────────────────────────────
async function getSlackUserId(token: string, email: string): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (!data.ok) {
    console.warn(`[notify-slack] 유저 조회 실패: ${email} → ${data.error}`)
    return null
  }
  return data.user.id
}

// ── Slack DM 발송 ─────────────────────────────────────────────
async function sendDm(token: string, slackUserId: string, text: string): Promise<boolean> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: slackUserId, text }),
  })
  const data = await res.json()
  if (!data.ok) console.warn(`[notify-slack] DM 발송 실패: ${slackUserId} → ${data.error}`)
  return data.ok
}

// ── 이메일 → DM 헬퍼 ──────────────────────────────────────────
async function notifyByEmail(token: string, email: string, text: string): Promise<boolean> {
  const uid = await getSlackUserId(token, email)
  if (!uid) return false
  return await sendDm(token, uid, text)
}


// ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? ''
    if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN 미설정')

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase 환경변수 미설정 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')

    // ── 인증: service_role(내부 호출) 또는 x-webhook-secret(웹훅) 일치만 허용 ──
    const WEBHOOK_SECRET = Deno.env.get('EDGE_WEBHOOK_SECRET') ?? ''
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    const webhookSecret = req.headers.get('x-webhook-secret') ?? ''
    if (!((bearer && bearer === SERVICE_KEY) || (WEBHOOK_SECRET && webhookSecret === WEBHOOK_SECRET))) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let payload
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 1: 직접 호출  { email, title, message }
    // ══════════════════════════════════════════════════════════
    if (payload.email) {
      const { email, title, message } = payload
      const text = title ? `*${title}*\n${message}` : String(message)
      const sent = await notifyByEmail(SLACK_BOT_TOKEN, email, text)
      console.log(`[notify-slack] 직접 DM → ${email}: ${sent ? '성공' : '실패'}`)
      return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 2: DB Webhook  { type, table, record, old_record }
    // ══════════════════════════════════════════════════════════
    const { type, table, record } = payload
    if (!record) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no record' }), { headers: corsHeaders })
    }

    // ── 입고 특이사항 신규 등록 (INSERT) ──────────────────────
    if (table === 'logistics_issues' && type === 'INSERT') {
      const brand = record.brand || ''

      // 웹앱 알림과 동일 조건: managed_brands에 '전체' 또는 해당 브랜드가 있는 관리자만
      const { data: admins } = await admin
        .from('profiles')
        .select('slack_email, managed_brands')
        .in('role', ['관리자', '최고관리자'])
        .eq('status', '정상')
        .not('slack_email', 'is', null)

      const adminEmails: string[] = (admins ?? [])
        .filter((a: { managed_brands?: string }) => {
          const brands = a.managed_brands?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
          return brands.includes('전체') || brands.includes(brand)
        })
        .map((a: { slack_email: string }) => a.slack_email)
        .filter(Boolean)

      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/list?brand=${encodeURIComponent(brand)}`
      const text = [
        `🚨 *새 입고 특이사항이 등록되었습니다*`,
        `• 접수번호: ${record.reception_no || '-'}`,
        `• 브랜드: ${brand || '-'}`,
        `• 품목코드: ${record.product_code || '-'}`,
        `• 등록자: ${record.reporter || '-'}`,
        `• 내용: ${record.request_content || '-'}`,
        `\n<${deepLink}|LETUS LOGIS에서 확인하세요.>`,
      ].join('\n')

      let sent = 0
      for (const email of adminEmails) {
        if (await notifyByEmail(SLACK_BOT_TOKEN, email, text)) sent++
      }
      console.log(`[notify-slack] 특이사항 등록 → brand=${brand} | 대상 ${adminEmails.length}명 중 ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true, skipped: 'no matching rule' }), { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[notify-slack] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
