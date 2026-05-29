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

    // 하이픈 뒤 색상코드 제거 → 품목코드 부분만 추출
    const upper = String(scanned_code).trim().toUpperCase()
    const baseCode = upper.includes('-') ? upper.split('-').slice(0, -1).join('-') : upper

    // 해당 브랜드 전체 품목 조회
    const { data, error } = await admin
      .from('products')
      .select('item_code, item_name, item_color, brand_category')
      .eq('brand_category', brand)

    if (error) return json({ error: error.message }, 500)
    if (!data || data.length === 0) return json({ candidates: [] })

    // 서버에서 Levenshtein 전체 계산 후 상위 5건만 반환
    const candidates = data
      .map(p => ({ ...p, dist: levenshtein(baseCode, (p.item_code || '').toUpperCase()) }))
      .filter(p => p.dist > 0 && p.dist <= 2)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5)

    return json({ candidates })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('🚨 에러:', message)
    return json({ error: message }, 500)
  }
})
