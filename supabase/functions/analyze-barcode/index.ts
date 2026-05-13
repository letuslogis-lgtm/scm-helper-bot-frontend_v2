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

async function checkAndGetInfo(
  admin: ReturnType<typeof createClient>,
  code: string
): Promise<{ is_valid: boolean; brand: string | null; vendor: string | null }> {
  if (!code) return { is_valid: false, brand: null, vendor: null }
  const parts = code.split('-')
  try {
    let query = admin.from('products').select('brand_category,brand,vendor,production_line,supplier')
    if (parts.length > 1) {
      query = query.eq('item_code', parts.slice(0, -1).join('-')).eq('item_color', parts[parts.length - 1])
    } else {
      query = query.eq('item_code', code)
    }
    const { data } = await query.limit(1).single()
    if (!data) return { is_valid: false, brand: null, vendor: null }
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
[예시] 입력: "HSOC1140DTRA 2026-03-16 F", 옆에 "WW" → 정답: {"product_code": "HSOC1140DTRA-WW"}

오직 아래 JSON 형식으로만 응답하세요:
{"product_code": "추출된코드 또는 null", "barcode_type": "code128 | qr | ean13 | text_label | unknown"}`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1 },
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

    const { is_valid, brand, vendor } = await checkAndGetInfo(admin, rawCode)

    return json({
      product_code: rawCode,
      is_valid,
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
