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

// ---- 보정 예시 캐시 (콜드스타트 1회만 Storage 읽기) ----
let _examplesBlock = ''
let _cacheLoadedAt = 0
const CACHE_TTL_MS = 3_600_000 // 1시간

async function getExamplesBlock(admin: ReturnType<typeof createClient>): Promise<string> {
  const now = Date.now()
  if (_examplesBlock !== undefined && now - _cacheLoadedAt < CACHE_TTL_MS) return _examplesBlock
  try {
    const { data, error } = await admin.storage
      .from('issue_images')
      .download('_config/barcode-examples.json')
    if (error || !data) { _cacheLoadedAt = now; return '' }
    const parsed = JSON.parse(await data.text())
    const examples: Array<{ ai: string; correct: string }> = parsed.examples ?? []
    if (examples.length === 0) {
      _examplesBlock = ''
    } else {
      const lines = examples.map(e => `- AI 인식 "${e.ai}" → 정답 "${e.correct}"`)
      _examplesBlock = `\n[실제 보정 사례 — 아래 패턴에서 특히 색상코드를 놓치지 마세요]\n${lines.join('\n')}\n`
    }
    _cacheLoadedAt = now
  } catch {
    _cacheLoadedAt = now // 실패해도 스캔 차단 안 함
  }
  return _examplesBlock
}


async function checkAndGetInfo(
  admin: ReturnType<typeof createClient>,
  code: string
): Promise<{ is_valid: boolean; brand: string | null; vendor: string | null }> {
  if (!code) return { is_valid: false, brand: null, vendor: null }
  const parts = code.split('-')
  const itemCode = parts.slice(0, -1).join('-')
  const itemColor = parts.length > 1 ? parts[parts.length - 1] : null

  console.log('[checkAndGetInfo] 조회 시도 —', JSON.stringify({ code, itemCode, itemColor }))

  try {
    let query = admin.from('products').select('brand_category, vendor, production_line')
    if (parts.length > 1) {
      query = query.eq('item_code', itemCode).eq('item_color', itemColor)
    } else {
      query = query.eq('item_code', code)
    }
    const { data, error } = await query.limit(1).maybeSingle()
    if (error) {
      console.error('[checkAndGetInfo] 쿼리 에러 —', error.message || JSON.stringify(error))
      return { is_valid: false, brand: null, vendor: null }
    }
    if (!data) {
      console.warn('[checkAndGetInfo] 결과 없음 — itemCode:', itemCode, '/ itemColor:', itemColor)
      return { is_valid: false, brand: null, vendor: null }
    }
    const brand = data.brand_category || data.brand || null
    const rawVendor = data.vendor || data.production_line || null

    // vendor_aliases 에서 정규화된 이름 조회
    let vendor = rawVendor
    if (rawVendor) {
      const { data: alias } = await admin
        .from('vendor_aliases')
        .select('canonical_name')
        .eq('raw_name', rawVendor)
        .maybeSingle()
      if (alias?.canonical_name) vendor = alias.canonical_name
    }

    return { is_valid: true, brand, vendor }
  } catch (e) {
    console.error('[checkAndGetInfo] 예외 — code:', code, '/', e)
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

    // 요청 파싱과 예시 캐시 로드를 병렬 실행 → 콜드스타트 지연 최소화
    const [body, examplesBlock] = await Promise.all([
      req.json(),
      getExamplesBlock(admin),
    ])
    const { image, mimeType, code: textCode } = body

    // ── 텍스트 코드 직접 조회 모드 (이미지 없이 product_code 문자열만 전달) ──
    if (!image && textCode) {
      const code = String(textCode).trim().toUpperCase()
      const info = await checkAndGetInfo(admin, code)
      return json({
        product_code: code,
        is_valid: info.is_valid,
        brand: info.brand,
        vendor: info.vendor,
        has_similar: false,
        similar_codes: [],
        barcode_type: null,
        description: null,
        message: info.is_valid ? '코드 조회 성공' : '코드를 찾을 수 없습니다.',
      })
    }

    if (!image) return json({ message: '이미지가 제공되지 않았습니다.' }, 400)

    const prompt = `당신은 최고 수준의 물류 SCM 라벨 판독기입니다. 첨부된 사진을 분석하여 오직 JSON 형식으로만 응답하세요.
바코드가 가장 명확하게 보이는 부분을 찾아 아래 규칙대로 판독하세요.

[핵심 추출 규칙]
1. 바코드 주변에서 '품목코드'와 '색상코드'를 찾아 반드시 중간에 하이픈(-)을 넣어 "품목코드-색상코드" 형태로 결합하세요.
2. 예외: 품목코드 자체에 이미 하이픈과 색상코드가 결합되어 있다면 별도 색상코드는 무시하세요.

[절대 무시 규칙] 괄호 기호 안의 내용, 생산일자, 벤더 영문 코드, 로트 번호 등 무시.
[숫자/문자 구분 규칙] 물류 품목코드에서 숫자처럼 생긴 문자는 반드시 숫자로 인식하세요. 특히 '0'(숫자 영)과 'O'(알파벳 오)를 혼동하지 마세요. 예: CH0027MAF 에서 '00'은 숫자 영이며 알파벳 O가 아닙니다.
[예시] 입력: "HSOC1140DTRA 2026-03-16 F", 옆에 "WW" → 정답: {"product_code": "HSOC1140DTRA-WW"}
${examplesBlock}
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
      const internalMsg = geminiData.error?.message || 'Gemini API 응답 없음'
      console.error('Gemini 에러:', internalMsg)
      // 과부하·할당량 초과 에러 → 프론트엔드가 1회 재시도할 수 있도록 retryable 반환
      const isRetryable = geminiRes.status === 503
        || /high demand|overloaded|quota|rate.?limit|temporarily/i.test(internalMsg)
      return json({
        product_code: null,
        retryable: isRetryable,
        message: isRetryable
          ? 'AI 서버가 일시적으로 혼잡합니다. 잠시 후 재시도합니다...'
          : '바코드 분석에 실패했습니다. 잠시 후 다시 시도해주세요.',
      })
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

    const rawCode = parsed?.product_code
      ? String(parsed.product_code).trim().toUpperCase().replace(/\s+/g, '').replace(/\s*-\s*/g, '-')
      : null

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

    return json({
      product_code: finalCode,
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
    console.error('🚨 analyze-barcode 에러:', message)
    return json({ error: '바코드 분석 중 오류가 발생했습니다.' }, 500)
  }
})
