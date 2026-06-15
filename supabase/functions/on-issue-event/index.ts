import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Slack DM 헬퍼 (notify-slack Edge Function 경유) ──────────
async function sendSlack(supabaseUrl: string, serviceKey: string, email: string, title: string, message: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, title, message }),
    })
    const json = await res.json()
    return !!json.sent
  } catch (e) {
    console.warn(`[on-issue-event] Slack 실패 (${email}):`, e)
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const SLACK_BOT_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') ?? ''

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders })
    }

    // DB Webhook 페이로드: { type, table, record, old_record }
    let payload
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const record    = payload.record    ?? payload
    const oldRecord = payload.old_record ?? {}

    const newStatus = record?.status
    const oldStatus = oldRecord?.status
    const brand       = record.brand         ?? ''
    const vendor      = record.vendor        ?? ''
    const receptionNo = record.reception_no  ?? ''

    // 상태 전환이 아닌 경우 스킵
    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no status change' }), { headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ══════════════════════════════════════════════════════════
    // 케이스 1: 이관 중 — 이관팀 사용자에게 Slack 알림 + assigned_team 저장
    // ══════════════════════════════════════════════════════════
    if (newStatus === '이관 중' && oldStatus !== '이관 중') {
      const relayContent = record.relay_content ?? ''

      // brand AND vendor 매칭 사용자 조회 (사용자 역할만)
      const { data: profiles } = await admin
        .from('profiles')
        .select('name, team, slack_email, managed_brands, managed_vendors')
        .eq('role', '사용자')
        .eq('status', '정상')

      const matchedUsers = (profiles ?? []).filter((p: {
        managed_brands?: string; managed_vendors?: string
      }) => {
        const brands  = p.managed_brands?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
        const vendors = p.managed_vendors?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
        const brandMatch = brands.includes(brand)
        if (!vendor) return brandMatch           // vendor null → brand만 매칭
        return brandMatch && vendors.includes(vendor)  // AND 조건
      })

      console.log(`[on-issue-event] 이관 중: ${receptionNo} | brand=${brand} vendor=${vendor} | 매칭=${matchedUsers.length}명`)

      // assigned_team 저장
      if (matchedUsers.length > 0) {
        const teams = [...new Set(matchedUsers.map((u: { team?: string }) => u.team).filter(Boolean))]
        const assignedTeam = (teams as string[]).join(',')
        await admin.from('logistics_issues').update({ assigned_team: assignedTeam }).eq('id', record.id)
        console.log(`[on-issue-event] assigned_team 저장: "${assignedTeam}"`)
      }

      // Slack 발송
      if (!SLACK_BOT_TOKEN) {
        return new Response(JSON.stringify({ ok: true, matched: matchedUsers.length, slack: 'skipped' }), { headers: corsHeaders })
      }

      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/list?brand=${encodeURIComponent(brand)}${vendor ? `&vendor=${encodeURIComponent(vendor)}` : ''}`
      const message = [
        `📋 *이슈가 귀 팀으로 이관되었습니다*`,
        `• 접수번호: ${receptionNo}`,
        `• 브랜드: ${brand}`,
        `• 공급업체: ${vendor || '-'}`,
        `• 이관 내용:\n${relayContent || '(내용 없음)'}`,
        `\n<${deepLink}|LETUS LOGIS에서 확인 후 회신해주세요.>`,
      ].join('\n')

      let sent = 0
      for (const user of matchedUsers) {
        if (!(user as { slack_email?: string }).slack_email) continue
        if (await sendSlack(SUPABASE_URL, SERVICE_KEY, (user as { slack_email: string }).slack_email, '📋 이슈가 이관되었습니다', message)) sent++
      }

      console.log(`[on-issue-event] 이관 Slack ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, case: '이관 중', matched: matchedUsers.length, sent }), { headers: corsHeaders })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 2: 이관부서 확인 — 브랜드 매칭 관리자에게 Slack 알림
    // ══════════════════════════════════════════════════════════
    if (newStatus === '이관부서 확인' && oldStatus !== '이관부서 확인') {
      const purchaseResponse = record.purchase_response ?? ''

      // managed_brands 매칭 관리자 조회
      const { data: admins } = await admin
        .from('profiles')
        .select('name, slack_email, managed_brands')
        .in('role', ['관리자', '최고관리자'])
        .eq('status', '정상')
        .not('slack_email', 'is', null)

      const matchedAdmins = (admins ?? []).filter((a: { managed_brands?: string }) => {
        const brands = a.managed_brands?.split(',').map((s: string) => s.trim()).filter(Boolean) ?? []
        return brands.includes('전체') || brands.includes(brand)
      })

      console.log(`[on-issue-event] 이관부서 확인: ${receptionNo} | brand=${brand} | 관리자 ${matchedAdmins.length}명`)

      if (!SLACK_BOT_TOKEN) {
        return new Response(JSON.stringify({ ok: true, matched: matchedAdmins.length, slack: 'skipped' }), { headers: corsHeaders })
      }

      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/list?brand=${encodeURIComponent(brand)}${vendor ? `&vendor=${encodeURIComponent(vendor)}` : ''}`
      const message = [
        `🔔 *이관 부서에서 회신이 등록되었습니다*`,
        `• 접수번호: ${receptionNo}`,
        `• 브랜드: ${brand}`,
        `• 공급업체: ${vendor || '-'}`,
        `• 회신 내용:\n${purchaseResponse || '(내용 없음)'}`,
        `\n<${deepLink}|LETUS LOGIS에서 확인 후 조치를 등록해주세요.>`,
      ].join('\n')

      let sent = 0
      for (const a of matchedAdmins) {
        if (await sendSlack(SUPABASE_URL, SERVICE_KEY, (a as { slack_email: string }).slack_email, '🔔 이관 회신이 도착했습니다', message)) sent++
      }

      console.log(`[on-issue-event] 이관부서 확인 Slack ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, case: '이관부서 확인', matched: matchedAdmins.length, sent }), { headers: corsHeaders })
    }

    // 해당 없는 상태 전환
    return new Response(JSON.stringify({ ok: true, skipped: `unhandled status: ${newStatus}` }), { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[on-issue-event] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
