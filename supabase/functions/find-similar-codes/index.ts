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

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Server misconfigured' }, 500)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { scanned_code, brand } = await req.json()
    if (!scanned_code || !brand) return json({ error: 'scanned_code, brand 필수' }, 400)

    // 색상코드 분리
    const upper = String(scanned_code).trim().toUpperCase()
    const parts = upper.split('-')
    const baseCode  = parts.length > 1 ? parts.slice(0, -1).join('-') : upper
    const colorCode = parts.length > 1 ? parts[parts.length - 1] : ''

    // 해당 브랜드 전체 품목 조회
    const { data, error } = await admin
      .from('products')
      .select('item_code, item_name, item_color, brand_category')
      .eq('brand_category', brand)
      .order('item_code')

    if (error) return json({ error: error.message }, 500)
    if (!data || data.length === 0) return json({ candidates: [], _debug: { brand, total: 0 } })

    // 품목코드 기준 Levenshtein 계산 (색상코드 제외하고 비교)
    const candidates = data
      .map(p => {
        const dbCode = (p.item_code || '').toUpperCase()
        const dist = levenshtein(baseCode, dbCode)
        return { ...p, dist }
      })
      .filter(p => p.dist > 0 && p.dist <= 4)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)

    if (candidates.length === 0) {
      return json({ candidates: [], _debug: { baseCode, colorCode, total: data.length } })
    }

    // 입고계획 조회 — candidates의 item_code 기준
    const candidateCodes = candidates.map(c => c.item_code)
    const today = new Date().toISOString().split('T')[0]

    const { data: plans } = await admin
      .from('incoming_plans')
      .select('item_code, plan_date, planned_qty, vendor, company')
      .in('item_code', candidateCodes)
      .gte('plan_date', today)
      .order('plan_date')

    // item_code → 가장 빠른 입고계획 매핑
    const planMap = new Map<string, { plan_date: string; planned_qty: number | null; vendor: string | null; company: string }>()
    for (const plan of (plans ?? [])) {
      if (!planMap.has(plan.item_code)) {
        planMap.set(plan.item_code, {
          plan_date:   plan.plan_date,
          planned_qty: plan.planned_qty,
          vendor:      plan.vendor,
          company:     plan.company,
        })
      }
    }

    // 입고계획 정보 병합 + 재정렬 (has_plan 우선 → dist 순)
    const enriched = candidates
      .map(c => ({
        ...c,
        has_plan:     planMap.has(c.item_code),
        plan_date:    planMap.get(c.item_code)?.plan_date   ?? null,
        planned_qty:  planMap.get(c.item_code)?.planned_qty ?? null,
        plan_vendor:  planMap.get(c.item_code)?.vendor      ?? null,
        plan_company: planMap.get(c.item_code)?.company     ?? null,
      }))
      .sort((a, b) => {
        if (a.has_plan !== b.has_plan) return a.has_plan ? -1 : 1
        return a.dist - b.dist
      })

    return json({ candidates: enriched, _debug: { baseCode, colorCode, total: data.length } })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('🚨 에러:', message)
    return json({ error: message }, 500)
  }
})
