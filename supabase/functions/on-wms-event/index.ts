import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Slack DM 헬퍼 ────────────────────────────────────────────
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
    console.warn(`[on-wms-event] Slack 실패 (${email}):`, e)
    return false
  }
}

// ── 프로필 전체 로드 헬퍼 ────────────────────────────────────
async function loadProfiles(admin: ReturnType<typeof createClient>) {
  const { data } = await admin
    .from('profiles')
    .select('name, role, team, slack_email, managed_brands, managed_vendors')
    .eq('status', '정상')
  return data ?? []
}

type Profile = {
  name: string; role: string; team?: string
  slack_email?: string; managed_brands?: string; managed_vendors?: string
}

function brandMatch(profile: Profile, brand: string) {
  const brands = profile.managed_brands?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  return brands.includes('전체') || brands.includes(brand)
}

function vendorMatch(profile: Profile, vendor: string) {
  const vendors = profile.managed_vendors?.split(',').map(s => s.trim()).filter(Boolean) ?? []
  return vendors.includes(vendor)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: corsHeaders })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 A: WMS 결품 추출 완료
    // worker.mjs 가 직접 호출: { event: 'wms_complete', job_name }
    // ══════════════════════════════════════════════════════════
    if (body.event === 'wms_complete') {
      const jobName = body.job_name ?? 'WMS 결품 추출'

      // 가장 최근 upload_date 기준으로 데이터 조회
      const { data: latest } = await admin
        .from('wms_shortage_list')
        .select('upload_date')
        .order('upload_date', { ascending: false })
        .limit(1)
        .single()

      if (!latest?.upload_date) {
        return new Response(JSON.stringify({ ok: true, skipped: 'no wms data' }), { headers: corsHeaders })
      }

      const { data: wmsRows } = await admin
        .from('wms_shortage_list')
        .select('brand, vendor')
        .eq('upload_date', latest.upload_date)

      const brands  = [...new Set((wmsRows ?? []).map(r => r.brand).filter(Boolean))] as string[]
      const vendors = [...new Set((wmsRows ?? []).map(r => r.vendor).filter(Boolean))] as string[]

      console.log(`[on-wms-event] wms_complete | date=${latest.upload_date} | brands=${brands.length} vendors=${vendors.length}`)

      const profiles = await loadProfiles(admin)
      const title = '📋 WMS 결품 리스트가 업데이트되었습니다'
      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/wms_shortage?date=${latest.upload_date}`
      const message = [
        `*${jobName}* 자동 추출이 완료되었습니다.`,
        `• 업데이트 일자: ${latest.upload_date}`,
        `• 브랜드: ${brands.join(', ') || '-'}`,
        `\n<${deepLink}|LETUS LOGIS에서 결품 현황을 확인하세요.>`,
      ].join('\n')

      let sent = 0
      for (const p of profiles) {
        if (!p.slack_email) continue
        const isAdmin = p.role === '관리자' || p.role === '최고관리자'
        const isUser  = p.role === '사용자'

        const shouldNotify =
          (isAdmin && brands.some(b => brandMatch(p, b))) ||
          (isUser  && vendors.some(v => vendorMatch(p, v)))

        if (shouldNotify && await sendSlack(SUPABASE_URL, SERVICE_KEY, p.slack_email, title, message)) sent++
      }

      console.log(`[on-wms-event] wms_complete Slack ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, case: 'wms_complete', sent }), { headers: corsHeaders })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 B: WMS 미확인 30분 주기 체크
    // worker.mjs cron 이 호출: { event: 'wms_check_pending' }
    // ══════════════════════════════════════════════════════════
    if (body.event === 'wms_check_pending') {
      // 조치 미등록(action_type IS NULL) 항목 조회 — 최근 30일 이내
      const since = new Date(Date.now() + 9 * 60 * 60 * 1000) // KST 기준
      since.setUTCDate(since.getUTCDate() - 30)
      const sinceStr = since.toISOString().split('T')[0]

      const { data: pending } = await admin
        .from('wms_shortage_list')
        .select('vendor, delivery_date')
        .is('action_type', null)
        .gte('delivery_date', sinceStr)

      if (!pending || pending.length === 0) {
        console.log('[on-wms-event] wms_check_pending — 미확인 없음')
        return new Response(JSON.stringify({ ok: true, case: 'wms_check_pending', pending: 0 }), { headers: corsHeaders })
      }

      const vendors = [...new Set(pending.map(r => r.vendor).filter(Boolean))] as string[]
      console.log(`[on-wms-event] wms_check_pending | 미확인 ${pending.length}건 | vendors=${vendors.length}`)

      const profiles = await loadProfiles(admin)
      const title = '⚠️ WMS 결품 미확인 항목이 있습니다'
      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/wms_shortage?action_status=none`
      const message = [
        `조치가 등록되지 않은 결품 항목이 *${pending.length}건* 있습니다.`,
        `• 해당 공급업체: ${vendors.slice(0, 5).join(', ')}${vendors.length > 5 ? ` 외 ${vendors.length - 5}곳` : ''}`,
        `\n<${deepLink}|LETUS LOGIS에서 조치사항을 등록해주세요.>`,
      ].join('\n')

      let sent = 0
      for (const p of profiles) {
        if (!p.slack_email || p.role !== '사용자') continue
        if (vendors.some(v => vendorMatch(p, v))) {
          if (await sendSlack(SUPABASE_URL, SERVICE_KEY, p.slack_email, title, message)) sent++
        }
      }

      console.log(`[on-wms-event] wms_check_pending Slack ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, case: 'wms_check_pending', pending: pending.length, sent }), { headers: corsHeaders })
    }

    // ══════════════════════════════════════════════════════════
    // 케이스 C: DB Webhook — wms_action_logs INSERT
    // 조치사항 등록 시 brand 매칭 관리자에게 알림
    // ══════════════════════════════════════════════════════════
    const record = body.record ?? body
    if (record?.shortage_id) {
      const { data: shortage } = await admin
        .from('wms_shortage_list')
        .select('brand, vendor, item_code, delivery_date')
        .eq('id', record.shortage_id)
        .single()

      if (!shortage) {
        return new Response(JSON.stringify({ ok: true, skipped: 'shortage not found' }), { headers: corsHeaders })
      }

      const { brand, vendor, item_code, delivery_date } = shortage
      console.log(`[on-wms-event] wms_action_logged | brand=${brand} vendor=${vendor}`)

      const profiles = await loadProfiles(admin)
      const title = '✅ WMS 결품 조치사항이 등록되었습니다'
      const deepLink = `https://scm-helper-bot-frontend-v2.vercel.app/wms_shortage?vendor=${encodeURIComponent(vendor || '')}${delivery_date ? `&date=${delivery_date}` : ''}`
      const message = [
        `*WMS 결품 조치사항*이 등록되었습니다.`,
        `• 품목코드: ${item_code || '-'}`,
        `• 브랜드: ${brand || '-'}`,
        `• 공급업체: ${vendor || '-'}`,
        `• 납품일: ${delivery_date || '-'}`,
        `• 조치 유형: ${record.action_type || '-'}`,
        `• 조치 내용: ${record.action_detail || '-'}`,
        `• 등록자: ${record.updated_by || '-'}`,
        `\n<${deepLink}|LETUS LOGIS에서 확인하세요.>`,
      ].join('\n')

      let sent = 0
      for (const p of profiles) {
        if (!p.slack_email || (p.role !== '관리자' && p.role !== '최고관리자')) continue
        if (brandMatch(p, brand)) {
          if (await sendSlack(SUPABASE_URL, SERVICE_KEY, p.slack_email, title, message)) sent++
        }
      }

      console.log(`[on-wms-event] wms_action_logged Slack ${sent}명 전송`)
      return new Response(JSON.stringify({ ok: true, case: 'wms_action_logged', sent }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true, skipped: 'no matching case' }), { headers: corsHeaders })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[on-wms-event] 에러:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
