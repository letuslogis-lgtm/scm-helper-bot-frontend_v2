// ============================================================
// 📌 Supabase Edge Function: analyze-barcode (v1)
// ============================================================
// 모바일 PWA에서 촬영한 사진의 바코드를 Gemini Vision으로 인식
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { image, mimeType } = await req.json()

    if (!image) {
      return new Response(
        JSON.stringify({ message: '이미지가 제공되지 않았습니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY가 등록되지 않았습니다.')

    const prompt = `당신은 물류 창고에서 사용되는 바코드/라벨 인식 전문가입니다.
이 이미지에서 바코드, QR코드, 또는 제품 라벨에 적힌 품목코드/제품코드를 찾아주세요.

[출력 형식 — 반드시 아래 JSON만 출력]
{
  "product_code": "인식된 품목코드 문자열 (없으면 null)",
  "description": "라벨에 적힌 제품 설명이 있다면 간단히 (없으면 빈 문자열)",
  "barcode_type": "code128 | qr | ean13 | datamatrix | text_label | unknown",
  "confidence": "high | medium | low"
}

[규칙]
1. 바코드가 보이면 디코딩하여 product_code에 넣으세요.
2. 바코드가 없지만 텍스트로 된 품목코드(예: 제품 라벨)가 보이면 그것을 넣으세요.
3. 아무것도 인식할 수 없으면 product_code를 null로 반환하세요.
4. 여러 바코드가 있으면 가장 선명한 것을 선택하세요.

JSON 응답:`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'image/jpeg',
                  data: image
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
          },
        }),
      }
    )

    const result = await res.json()

    if (!result.candidates) {
      const errorMsg = result.error?.message || 'Gemini API 응답 없음'
      console.error('Gemini 에러:', errorMsg)
      return new Response(
        JSON.stringify({ product_code: null, message: errorMsg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawText = result.candidates[0]?.content?.parts?.[0]?.text || ''
    
    // JSON 파싱
    let parsed = null
    try {
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
    } catch (e) {
      console.warn('JSON 파싱 실패:', rawText)
    }

    if (parsed && parsed.product_code) {
      return new Response(
        JSON.stringify({
          product_code: String(parsed.product_code),
          description: parsed.description || '',
          barcode_type: parsed.barcode_type || 'unknown',
          confidence: parsed.confidence || 'medium'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      return new Response(
        JSON.stringify({
          product_code: null,
          message: '바코드 또는 품목코드를 인식하지 못했습니다. 다른 각도에서 다시 촬영해주세요.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error: any) {
    console.error('🚨 에러:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
