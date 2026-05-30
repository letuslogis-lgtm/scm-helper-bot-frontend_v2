// ============================================================
// 📌 Supabase Edge Function: classify-accident
// 발생 원인 + 상세 내역 → 확인 결과 / 귀책부서 추천
// Step 1: 규칙 기반 키워드 매칭
// Step 2: 미매칭 시 Gemini AI 호출
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================
// 🔧 규칙 기반 분류 엔진
// ============================================================
function ruleClassify(causeType: string, causeDetail: string): { action_result: string | null, responsible_dept: string | null } | null {
  const type  = causeType.trim()
  const detail = causeDetail.toLowerCase()

  // ── 제조/생산 이슈 ─────────────────────────────────────────
  if (type === '재고/수량 이슈' || type === '제조/생산 이슈') {
    const mfgKw = ['생산 미출','생산미출','오포장','제조 오염','제품 불량','밴딩 불량','테이핑 불량','패키징 이슈','검수 불량','생산 지연','제품 누락','포장 불량']
    if (mfgKw.some(kw => detail.includes(kw))) {
      return { action_result: '제조/생산 이슈', responsible_dept: '구매/생산' }
    }
    // 화주사 미입고·입고 지연
    if (['화주사','미입고','입고 지연','입고지연'].some(kw => detail.includes(kw))) {
      return { action_result: '미출고', responsible_dept: '브랜드/3PL고객사' }
    }
  }

  // ── 전산/시스템 오류 ───────────────────────────────────────
  if (type === '전산/시스템 오류') {
    return { action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 서류/정보 불일치 ───────────────────────────────────────
  if (type === '서류/정보 불일치') {
    if (['직출','직송'].some(kw => detail.includes(kw))) {
      return { action_result: '현장직출', responsible_dept: '브랜드/3PL고객사' }
    }
    if (['대리점','화주사','취소','삭제','단종'].some(kw => detail.includes(kw))) {
      return { action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
    }
  }

  // ── 프로세스 미준수 ────────────────────────────────────────
  if (type === '프로세스 미준수') {
    if (['대리점','회수 시공','당일 회수','수주건이 없음'].some(kw => detail.includes(kw))) {
      return { action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
    }
  }

  // ── 작업자 귀책 ───────────────────────────────────────────
  if (type === '작업자 귀책') {
    if (['파손','파손 제품'].some(kw => detail.includes(kw))) return { action_result: '물류파손', responsible_dept: null }
    if (['누락','미출','오피킹','미상차'].some(kw => detail.includes(kw)))  return { action_result: '미출고',   responsible_dept: null }
    if (['오출','타 제품','혼적'].some(kw => detail.includes(kw)))          return { action_result: '오출고',   responsible_dept: null }
  }

  // ── 시공팀 귀책 ───────────────────────────────────────────
  if (type === '시공팀 귀책') {
    if (['파손'].some(kw => detail.includes(kw))) return { action_result: '시공파손', responsible_dept: null }
    if (['분실'].some(kw => detail.includes(kw))) return { action_result: '제품분실', responsible_dept: null }
  }

  return null // 규칙 미매칭 → AI로 넘김
}

// ============================================================
// 🤖 Gemini AI 분류 (규칙 미매칭 폴백)
// ============================================================
const AI_SYSTEM_PROMPT = `당신은 물류 상차 이슈 분류 전문가입니다.
발생 원인과 상세 내용을 읽고 아래 기준에 따라 '확인 결과'와 '귀책부서'를 추천하세요.

[확인 결과 옵션]
정상출고 / 출고 없음 / 미출고 / 오출고 / 과출고 / 물류파손 / 시공파손 / 현장직출 / 센터직출 / 납기연기(건) / 납기연기(품목) / 제품분실 / 제조/생산 이슈 / 기타

[귀책부서 옵션]
물류사업1팀 / 물류사업2팀 / 운송사업팀 / 컨택센터 / 라스트마일1팀 / 라스트마일2팀 / 구매/생산 / 브랜드/3PL고객사 / 기타

[핵심 판단 기준]
- 생산 미출, 오포장, 제조 오염, 제품 불량, 밴딩·테이핑·포장 불량 → 제조/생산 이슈 / 구매/생산
- 전산 오류, AS 오등록, 수주 삭제 → 출고 없음 / 브랜드/3PL고객사
- 대리점 오등록, 회수 시공건 없음 → 출고 없음 / 브랜드/3PL고객사
- 직출 진행건, 직출 협의 → 현장직출 / 브랜드/3PL고객사
- 화주사 미입고, 입고 지연 → 미출고 / 브랜드/3PL고객사
- 간선차량 파손, 운송 중 파손 → 물류파손 / 운송사업팀
- 원인 파악 불가, 귀책 불분명 → 기타 / 기타

반드시 아래 JSON 형식으로만 응답하세요:
{"action_result":"값","responsible_dept":"값","confidence":"high|medium|low","reason":"판단 근거 한 줄"}`

async function aiClassify(causeType: string, causeDetail: string, apiKey: string) {
  const prompt = `${AI_SYSTEM_PROMPT}\n\n발생 원인: ${causeType}\n상세 내용: ${causeDetail}\n\nJSON 응답:`
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    )
    const result = await res.json()
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return null

    const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      action_result:    parsed.action_result    || null,
      responsible_dept: parsed.responsible_dept || null,
      confidence:       parsed.confidence       || 'medium',
      reason:           parsed.reason           || '',
    }
  } catch (err) {
    console.error('AI 분류 오류:', err)
    return null
  }
}

// ============================================================
// 🚀 메인 핸들러
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { cause_type, cause_detail } = await req.json()

    if (!cause_type || !cause_detail) {
      return new Response(
        JSON.stringify({ error: '발생 원인(cause_type)과 상세 내용(cause_detail)이 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: 규칙 기반
    const ruleResult = ruleClassify(cause_type, cause_detail)
    if (ruleResult) {
      return new Response(
        JSON.stringify({ ...ruleResult, confidence: 'high', method: 'rule' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 2: AI 폴백
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return new Response(
        JSON.stringify({ action_result: null, responsible_dept: null, confidence: 'low', method: 'none' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const aiResult = await aiClassify(cause_type, cause_detail, apiKey)
    return new Response(
      JSON.stringify(aiResult
        ? { ...aiResult, method: 'ai' }
        : { action_result: null, responsible_dept: null, confidence: 'low', method: 'failed' }
      ),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('분류 오류:', error)
    return new Response(
      JSON.stringify({ error: '분류 처리 중 오류가 발생했습니다.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
