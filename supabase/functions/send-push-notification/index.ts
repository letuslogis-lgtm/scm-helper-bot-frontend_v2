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

    // 만료된 구독만 DB에서 제거 (410 Gone / 404 Not Found 한정, 일시 오류 5xx 등은 유지)
    const expiredEndpoints = subs
      .filter((_, i) => {
        if (results[i].status !== 'rejected') return false
        const reason = (results[i] as PromiseRejectedResult).reason
        const status = reason?.statusCode ?? reason?.status
        return status === 410 || status === 404
      })
      .map((s) => s.endpoint)

    if (expiredEndpoints.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
    }

    const sent = results.filter((r) => r.status === 'fulfilled').length
    console.log(`[send-push-notification] ${reporter} → ${sent}/${subs.length} 전송 완료`)

    // ── Slack DM: 등록자(reporter)에게도 조치완료 알림 ──────────
    try {
      const { data: profile } = await admin
        .from('profiles')
        .select('slack_email')
        .eq('name', reporter)
        .single()

      if (profile?.slack_email) {
        const email = profile.slack_email

        await fetch(`${SUPABASE_URL}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            title: '✅ 이슈가 조치완료 되었습니다',
            message: `접수번호 *${receptionNo}* 건이 처리되었습니다.\nLETUS LOGIS에서 조치 내용을 확인하세요.`,
          }),
        })
        console.log(`[send-push-notification] Slack DM → ${email}`)
      }
    } catch (slackErr: unknown) {
      // Slack 실패가 푸시 알림 결과에 영향을 주지 않도록 swallow
      const msg = slackErr instanceof Error ? slackErr.message : String(slackErr)
      console.warn(`[send-push-notification] Slack DM 실패 (무시): ${msg}`)
    }

    return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[send-push-notification] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
