import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const VAPID_EMAIL = Deno.env.get('VAPID_EMAIL') ?? 'mailto:admin@letus.com'

    if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders })
    }

    // Supabase Database Webhook 형식: { type, table, record, old_record }
    const payload = await req.json()
    const record = payload.record ?? payload
    const oldRecord = payload.old_record ?? {}

    // '조치완료'로 바뀐 경우에만 발송
    if (record?.status !== '조치완료' || oldRecord?.status === '조치완료') {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
    }

    const reporter: string = record.reporter
    const receptionNo: string = record.reception_no || ''
    if (!reporter) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_name', reporter)

    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders })
    }

    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const notificationPayload = JSON.stringify({
      title: '✅ 이슈가 조치완료 되었습니다',
      body: `접수번호 ${receptionNo} 건이 처리되었습니다.`,
      url: '/mobile/my-issues',
    })

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        )
      )
    )

    // 만료된 구독은 DB에서 제거
    const expiredEndpoints = subs
      .filter((_, i) => results[i].status === 'rejected')
      .map((s) => s.endpoint)

    if (expiredEndpoints.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length
    console.log(`[send-push-notification] ${reporter} → ${sent}/${subs.length} 전송 완료`)

    return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[send-push-notification] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
