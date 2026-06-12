// ============================================================
// 📌 Supabase Edge Function: update-barcode-examples (v1)
// ============================================================
// ai_analysis_logs의 MobileBarcode 보정 데이터를 읽어
// Storage(_config/barcode-examples.json)에 예시 파일을 저장한다.
//
// [트리거]
//   - Supabase DB Webhook: ai_analysis_logs UPDATE 시 자동 호출
//   - 또는 수동 POST 호출로도 실행 가능
//
// [저장 위치]  issue_images 버킷 / _config/barcode-examples.json
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server misconfigured' }, 500)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ---- ai_analysis_logs에서 MobileBarcode 보정 데이터 조회 ----
    const { data, error } = await admin
      .from('ai_analysis_logs')
      .select('ai_analyzed_cause, corrected_cause')
      .eq('source_menu', 'MobileBarcode')
      .eq('is_reviewed', true)
      .not('corrected_cause', 'is', null)
      .limit(100)

    if (error) {
      console.error('[update-barcode-examples] DB 조회 실패:', error.message)
      return json({ error: error.message }, 500)
    }

    // ---- 중복 제거 + 실제 보정 건만 추출 (AI ≠ 정답) ----
    const seen = new Set<string>()
    const examples: Array<{ ai: string; correct: string }> = []

    for (const row of (data ?? [])) {
      const ai = (row.ai_analyzed_cause ?? '').trim().toUpperCase()
      const correct = (row.corrected_cause ?? '').trim().toUpperCase()
      if (!ai || !correct || ai === correct) continue
      const key = `${ai}→${correct}`
      if (seen.has(key)) continue
      seen.add(key)
      examples.push({ ai, correct })
    }

    // ---- Storage에 저장 ----
    const payload = JSON.stringify({ examples, updatedAt: new Date().toISOString() })
    const bytes = new TextEncoder().encode(payload)

    const { error: uploadErr } = await admin.storage
      .from('issue_images')
      .upload('_config/barcode-examples.json', bytes, {
        contentType: 'application/json',
        upsert: true,
      })

    if (uploadErr) {
      console.error('[update-barcode-examples] Storage 저장 실패:', uploadErr.message)
      return json({ error: uploadErr.message }, 500)
    }

    console.log(`[update-barcode-examples] 완료 — 예시 ${examples.length}건 저장`)
    return json({ ok: true, count: examples.length })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[update-barcode-examples] 예외:', message)
    return json({ error: message }, 500)
  }
})
