import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL     = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const SLACK_BOT_TOKEN  = Deno.env.get('SLACK_BOT_TOKEN') ?? ''

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders })
    }

    // DB Webhook 페이로드: { type, table, record, old_record }
    const payload   = await req.json()
    const record    = payload.record    ?? payload
    const oldRecord = payload.old_record ?? {}

    // ── 이관 중 전환 감지 ─────────────────────────────────────────
    // status가 '이관 중'으로 바뀐 경우에만 처리
    if (record?.status !== '이관 중' || oldRecord?.status === '이관 중') {
      return new Response(JSON.stringify({ ok: true, skipped: true }), { headers: corsHeaders })
    }

    const brand  = record.brand  ?? ''
    const vendor = record.vendor ?? ''  // null 가능
    const receptionNo   = record.reception_no  ?? ''
    const relayContent  = record.relay_content ?? ''

    if (!brand) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no brand' }), { headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 매칭 유저 조회 ────────────────────────────────────────────
    // brand AND vendor 모두 managed_brands/managed_vendors에 포함된 사용자
    // vendor가 null이면 brand만 매칭 (fallback)
    const { data: profiles } = await admin
      .from('profiles')
      .select('name, team, slack_email, managed_brands, managed_vendors')
      .eq('role', '사용자')
      .eq('status', '정상')

    const matchedUsers = (profiles ?? []).filter((p) => {
      const brands  = p.managed_brands?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
      const vendors = p.managed_vendors?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []

      const brandMatch = brands.includes(brand)
      if (!vendor) return brandMatch                    // vendor null → brand만 매칭
      return brandMatch && vendors.includes(vendor)    // AND 조건
    })

    console.log(`[on-issue-event] 이관 중 감지: ${receptionNo} | brand=${brand} vendor=${vendor} | 매칭=${matchedUsers.length}명`)

    if (matchedUsers.length === 0) {
      console.log('[on-issue-event] 매칭 유저 없음 — assigned_team 스킵')
      return new Response(JSON.stringify({ ok: true, matched: 0 }), { headers: corsHeaders })
    }

    // ── assigned_team 저장 ───────────────────────────────────────
    const teams = [...new Set(matchedUsers.map((u: { team?: string }) => u.team).filter(Boolean))]
    const assignedTeam = teams.join(',')

    await admin
      .from('logistics_issues')
      .update({ assigned_team: assignedTeam })
      .eq('id', record.id)

    console.log(`[on-issue-event] assigned_team 저장: "${assignedTeam}"`)

    // ── Slack DM 발송 ─────────────────────────────────────────────
    if (!SLACK_BOT_TOKEN) {
      console.warn('[on-issue-event] SLACK_BOT_TOKEN 미설정 — Slack 스킵')
      return new Response(JSON.stringify({ ok: true, matched: matchedUsers.length, slack: 'skipped' }), { headers: corsHeaders })
    }

    const slackMessage = [
      `📋 *이슈가 귀 팀으로 이관되었습니다*`,
      `• 접수번호: ${receptionNo}`,
      `• 브랜드: ${brand}`,
      `• 공급업체: ${vendor || '-'}`,
      `• 이관 내용:\n${relayContent || '(내용 없음)'}`,
      `\n_LETUS LOGIS에서 확인 후 회신해주세요._`,
    ].join('\n')

    let slackSent = 0
    for (const user of matchedUsers) {
      if (!user.slack_email) continue
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: user.slack_email,
            title: '📋 이슈가 이관되었습니다',
            message: slackMessage,
          }),
        })
        const json = await res.json()
        if (json.sent) slackSent++
      } catch (e) {
        console.warn(`[on-issue-event] Slack 실패 (${user.slack_email}):`, e)
      }
    }

    console.log(`[on-issue-event] Slack DM ${slackSent}/${matchedUsers.filter((u: { slack_email?: string }) => u.slack_email).length}명 전송`)

    return new Response(
      JSON.stringify({ ok: true, matched: matchedUsers.length, assignedTeam, slackSent }),
      { headers: corsHeaders }
    )

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[on-issue-event] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
