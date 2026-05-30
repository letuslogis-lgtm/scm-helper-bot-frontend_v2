// ============================================================
// 📌 Supabase Edge Function: classify-accident (v2)
// 상세 내역(자유 텍스트)만 보고 발생 원인 + 확인 결과 + 귀책부서 추천
// Step 1: 규칙 기반 키워드 매칭
// Step 2: 미매칭 시 Gemini AI 호출
// Step 3: 결과를 ai_analysis_logs에 적재 (학습 데이터)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ClassifyResult = {
  cause_type:       string | null
  action_result:    string | null
  responsible_dept: string | null
}

// ============================================================
// 🔧 규칙 기반 분류 엔진 (상세 내역 텍스트만 사용)
// ============================================================
function ruleClassify(causeDetail: string): ClassifyResult | null {
  const d = causeDetail.toLowerCase()

  // ── 제조/생산 이슈 ─────────────────────────────────────────
  const mfgKw = ['생산 미출','생산미출','오포장','제조 오염','제품 불량','밴딩 불량',
                 '테이핑 불량','패키징 이슈','검수 불량','생산 지연','포장 불량','제조불량']
  if (mfgKw.some(kw => d.includes(kw))) {
    return { cause_type: '제조/생산 이슈', action_result: '제조/생산 이슈', responsible_dept: '구매/생산' }
  }

  // ── WMS·운송 전산 오류 → 미출고 ───────────────────────────
  const wmsKw = ['wms','wave','clac','출고 누락','작업 누락','운송 작업 불가','운송 전산','작업 오류','운송 누락','간선 누락']
  if (wmsKw.some(kw => d.includes(kw))) {
    return { cause_type: '전산/시스템 오류', action_result: '미출고', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 오등록·수주 오류 → 출고 없음 ──────────────────────────
  const sysKw = ['오등록','수주 삭제','수주 내 해당 제품','as 조치일','전산 오류','시스템 오류']
  if (sysKw.some(kw => d.includes(kw))) {
    return { cause_type: '전산/시스템 오류', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 직출 ──────────────────────────────────────────────────
  if (['직출 진행','직출 협의','직출하기로','현장 직출','센터 직출'].some(kw => d.includes(kw))) {
    return { cause_type: '서류/정보 불일치', action_result: '현장직출', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 대리점·화주사 오류 → 출고 없음 ───────────────────────
  if (['대리점','화주사'].some(kw => d.includes(kw)) &&
      ['오등록','잘못','없음','누락','오기재'].some(kw => d.includes(kw))) {
    return { cause_type: '서류/정보 불일치', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 화주사 미입고 ─────────────────────────────────────────
  if (['화주사 미입고','화주사 입고','화주사 지연'].some(kw => d.includes(kw))) {
    return { cause_type: '재고/수량 이슈', action_result: '미출고', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 회수 시공 관련 → 출고 없음 ────────────────────────────
  if (['회수 시공건','수주건이 없음','당일 회수','회수 시공 확인','회수건'].some(kw => d.includes(kw))) {
    return { cause_type: '프로세스 미준수', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 간선차량 파손 ─────────────────────────────────────────
  if (['간선차량','이동 중 파손','운송 중 파손'].some(kw => d.includes(kw))) {
    return { cause_type: '작업자 귀책', action_result: '물류파손', responsible_dept: '운송사업팀' }
  }

  // ── 피킹·상차 누락 ────────────────────────────────────────
  if (['피킹 누락','오피킹','미상차','오합적','피킹 미스'].some(kw => d.includes(kw))) {
    return { cause_type: '작업자 귀책', action_result: '미출고', responsible_dept: null }
  }

  // ── 작업 중 파손 ──────────────────────────────────────────
  if (['상차 중 파손','작업 중 파손','피킹 중 파손','분배 중 파손'].some(kw => d.includes(kw))) {
    return { cause_type: '작업자 귀책', action_result: '물류파손', responsible_dept: null }
  }

  // ── 고객 귀책 ─────────────────────────────────────────────
  if (['고객 변심','고객 반품','고객 취소','고객 요청','환불'].some(kw => d.includes(kw))) {
    return { cause_type: '기타', action_result: null, responsible_dept: '브랜드/3PL고객사' }
  }

  // ── 시공팀 파손·분실 ──────────────────────────────────────
  if (['시공 중 파손','시공팀 파손'].some(kw => d.includes(kw))) {
    return { cause_type: '시공팀 귀책', action_result: '시공파손', responsible_dept: null }
  }
  if (['시공팀 분실','시공 분실'].some(kw => d.includes(kw))) {
    return { cause_type: '시공팀 귀책', action_result: '제품분실', responsible_dept: null }
  }

  return null
}

// ============================================================
// 🤖 Gemini AI 분류 (규칙 미매칭 폴백)
// ============================================================
const AI_SYSTEM_PROMPT = `당신은 물류 상차 이슈 분류 전문가입니다.
상세 내역 텍스트를 읽고 아래 기준으로 '발생 원인', '확인 결과', '귀책부서'를 추천하세요.

[발생 원인 옵션]
작업자 귀책 / 시공팀 귀책 / 전산/시스템 오류 / 서류/정보 불일치 / 재고/수량 이슈 / 제조/생산 이슈 / 프로세스 미준수 / 기타

[확인 결과 옵션]
정상출고 / 출고 없음 / 미출고 / 오출고 / 과출고 / 물류파손 / 시공파손 / 현장직출 / 센터직출 / 납기연기(건) / 납기연기(품목) / 제품분실 / 제조/생산 이슈 / 기타

[귀책부서 옵션]
물류사업1팀 / 물류사업2팀 / 운송사업팀 / 컨택센터 / 라스트마일1팀 / 라스트마일2팀 / 구매/생산 / 브랜드/3PL고객사 / 기타

[판단 기준]
- 생산 미출, 오포장, 제조 오염, 제품 불량, 포장 불량 → 제조/생산 이슈 / 제조/생산 이슈 / 구매/생산
- WMS 오류, 출고 누락, 운송 전산 오류 → 전산/시스템 오류 / 미출고 / 브랜드/3PL고객사
- AS 오등록, 수주 삭제 → 전산/시스템 오류 / 출고 없음 / 브랜드/3PL고객사
- 대리점 오등록, 회수 시공건 없음 → 프로세스 미준수 / 출고 없음 / 브랜드/3PL고객사
- 직출 진행건 → 서류/정보 불일치 / 현장직출 / 브랜드/3PL고객사
- 화주사 미입고, 입고 지연 → 재고/수량 이슈 / 미출고 / 브랜드/3PL고객사
- 간선차량 파손, 운송 중 파손 → 작업자 귀책 / 물류파손 / 운송사업팀
- 피킹 누락, 오합적 → 작업자 귀책 / 미출고 / (물류사업팀)
- 고객 취소·반품·환불 → 기타 / 정상출고 / 브랜드/3PL고객사
- 원인 파악 불가 → 기타 / 기타 / 기타

판단이 어렵더라도 반드시 가장 가능성 높은 값을 추천하세요. null이나 빈값은 허용하지 않습니다.
확신이 낮으면 confidence를 low로, reason에 불확실한 이유를 적으세요.

반드시 아래 JSON 형식으로만 응답하세요:
{"cause_type":"값","action_result":"값","responsible_dept":"값","confidence":"high|medium|low","reason":"판단 근거 한 줄"}`

async function aiClassify(causeDetail: string, apiKey: string): Promise<ClassifyResult & { confidence: string, reason: string } | null> {
  const prompt = `${AI_SYSTEM_PROMPT}\n\n상세 내역: ${causeDetail}\n\nJSON 응답:`
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
      cause_type:       parsed.cause_type       || null,
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

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

    const { cause_detail, record_id } = await req.json()

    if (!cause_detail) {
      return new Response(
        JSON.stringify({ error: '상세 내역(cause_detail)이 필요합니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let finalResult: ClassifyResult & { confidence: string, method: string }
    const ruleResult = ruleClassify(cause_detail)

    if (ruleResult) {
      finalResult = { ...ruleResult, confidence: 'high', method: 'rule' }
    } else {
      const apiKey = Deno.env.get('GEMINI_API_KEY')
      if (!apiKey) {
        return new Response(
          JSON.stringify({ cause_type: null, action_result: null, responsible_dept: null, confidence: 'low', method: 'none' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const aiResult = await aiClassify(cause_detail, apiKey)
      finalResult = aiResult
        ? { ...aiResult, method: 'ai' }
        : { cause_type: null, action_result: null, responsible_dept: null, confidence: 'low', method: 'failed' }
    }

    // ── ai_analysis_logs 적재 (학습 데이터) ──────────────────
    if (record_id && (finalResult.cause_type || finalResult.action_result)) {
      await supabase.from('ai_analysis_logs').insert({
        source_menu: 'ClassifyAccident',
        target_id: String(record_id),
        original_text: cause_detail,
        ai_analyzed_cause: finalResult.cause_type,
        ai_cause_detail: `${finalResult.action_result ?? ''} / ${finalResult.responsible_dept ?? ''}`,
        ai_cause_summary: `방법: ${finalResult.method} | 확인결과: ${finalResult.action_result} | 귀책: ${finalResult.responsible_dept}`,
        ai_confidence: finalResult.confidence,
      }).catch(err => console.error('로그 저장 실패:', err))
    }

    return new Response(
      JSON.stringify(finalResult),
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
