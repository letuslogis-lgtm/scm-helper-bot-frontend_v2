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

async function checkAndGetInfo(
  admin: ReturnType<typeof createClient>,
  code: string
): Promise<{ is_valid: boolean; brand: string | null; vendor: string | null }> {
  if (!code) return { is_valid: false, brand: null, vendor: null }
  const parts = code.split('-')
  try {
    let query = admin.from('products').select('brand_category, brand, vendor, production_line, supplier')
    if (parts.length > 1) {
      query = query.eq('item_code', parts.slice(0, -1).join('-')).eq('item_color', parts[parts.length - 1])
    } else {
      query = query.eq('item_code', code)
    }
    const { data, error } = await query.limit(1).maybeSingle()
    if (error || !data) return { is_valid: false, brand: null, vendor: null }
    const brand = data.brand_category || data.brand || null
    const vendor = data.vendor || data.production_line || data.supplier || null
    return { is_valid: true, brand, vendor }
  } catch {
    return { is_valid: false, brand: null, vendor: null }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

    if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_API_KEY) {
      return json({ error: 'Server misconfigured' }, 500)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { image, mimeType } = await req.json()
    if (!image) return json({ message: '이미지가 제공되지 않았습니다.' }, 400)

    const prompt = `당신은 최고 수준의 물류 SCM 라벨 판독기입니다. 첨부된 사진을 분석하여 오직 JSON 형식으로만 응답하세요.
바코드가 가장 명확하게 보이는 부분을 찾아 아래 규칙대로 판독하세요.

[핵심 추출 규칙]
1. 바코드 주변에서 '품목코드'와 '색상코드'를 찾아 반드시 중간에 하이픈(-)을 넣어 "품목코드-색상코드" 형태로 결합하세요.
2. 예외: 품목코드 자체에 이미 하이픈과 색상코드가 결합되어 있다면 별도 색상코드는 무시하세요.

[절대 무시 규칙] 괄호 기호 안의 내용, 생산일자, 벤더 영문 코드, 로트 번호 등 무시.
[숫자/문자 구분 규칙] 물류 품목코드에서 숫자처럼 생긴 문자는 반드시 숫자로 인식하세요. 특히 '0'(숫자 영)과 'O'(알파벳 오)를 혼동하지 마세요. 예: CH0027MAF 에서 '00'은 숫자 영이며 알파벳 O가 아닙니다.
[예시] 입력: "HSOC1140DTRA 2026-03-16 F", 옆에 "WW" → 정답: {"product_code": "HSOC1140DTRA-WW"}

오직 아래 JSON 형식으로만 응답하세요:
{"product_code": "추출된코드 또는 null", "barcode_type": "code128 | qr | ean13 | text_label | unknown"}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    )

    const geminiData = await geminiRes.json()
    if (!geminiData.candidates) {
      const msg = geminiData.error?.message || 'Gemini API 응답 없음'
      console.error('Gemini 에러:', msg)
      return json({ product_code: null, message: msg })
    }

    const rawText = geminiData.candidates[0]?.content?.parts?.[0]?.text || ''
    let parsed: { product_code?: string | null; barcode_type?: string } | null = null
    try {
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch {
      console.warn('JSON 파싱 실패:', rawText)
    }

    const rawCode = parsed?.product_code ? String(parsed.product_code).trim().toUpperCase() : null

    if (!rawCode || rawCode === 'NULL') {
      return json({
        product_code: null,
        message: '바코드 또는 품목코드를 인식하지 못했습니다. 다른 각도에서 다시 촬영해주세요.',
      })
    }

    // ① 원본 + ② O→0 변환 병렬 조회
    const normalizedCode = /O/.test(rawCode) ? rawCode.replace(/O/g, '0') : null
    const [mainResult, normResult] = await Promise.all([
      checkAndGetInfo(admin, rawCode),
      normalizedCode
        ? checkAndGetInfo(admin, normalizedCode)
        : Promise.resolve({ is_valid: false, brand: null, vendor: null }),
    ])

    let is_valid = mainResult.is_valid
    let brand = mainResult.brand
    let vendor = mainResult.vendor
    let finalCode = rawCode

    if (!is_valid && normResult.is_valid) {
      is_valid = true
      brand = normResult.brand
      vendor = normResult.vendor
      finalCode = normalizedCode!
    }

    // ③ Levenshtein 유사 코드 탐색 (①②가 모두 실패한 경우에만)
    let has_similar = false
    if (!is_valid) {
      const baseCode = finalCode.includes('-')
        ? finalCode.split('-').slice(0, -1).join('-')
        : finalCode
      const prefix = baseCode.slice(0, 4).toUpperCase()
      try {
        const { data: candidates } = await admin
          .from('products')
          .select('item_code')
          .like('item_code', `${prefix}%`)
          .limit(200)
        if (candidates && candidates.length > 0) {
          has_similar = candidates.some(p => {
            const dist = levenshtein(baseCode.toUpperCase(), (p.item_code || '').toUpperCase())
            return dist > 0 && dist <= 2
          })
        }
      } catch {
        // 유사 코드 탐색 실패 시 무시
      }
    }

    return json({
      product_code: finalCode,
      is_valid,
      has_similar,
      brand,
      vendor,
      description: is_valid
        ? `브랜드: ${brand ?? '미확인'} / 공급사: ${vendor ?? '미확인'}`
        : 'DB 미등록 코드',
      barcode_type: parsed?.barcode_type || 'unknown',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('🚨 에러:', message)
    return json({ error: message }, 500)
  }
})
