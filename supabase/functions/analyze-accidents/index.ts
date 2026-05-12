// ============================================================
// 📌 Supabase Edge Function: analyze-accidents (v4 — AI Log 연동)
// ============================================================
// 변경점 (v3 → v4):
//   1. AI Insight Lab 연동을 위해 `ai_analysis_logs` 테이블에 기록 저장
//   2. 신뢰도(Confidence)가 low일 경우 `low_confidence_reason` 반환 유도
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// 📚 카테고리 온톨로지 (기존과 동일)
const CATEGORY_SYSTEM = `
[분류 체계 — 반드시 아래 코드 중 하나를 사용]

【1】현장 운영 귀책 (작업자·외주/협력사 소속)
- W-01: 피킹 수량 누락 (피킹 시 일부 수량만 담음, CUT 피킹 누락, 수량 확인 미흡)
- W-02: 오피킹 (타 제품 피킹, 혼적 LOC 오피킹)
- W-03: PLT 오분배/미분배 (PLT 오분배, 미분배, CUT 오분배, 미결존 오분배)
- W-04: 오합적 (타 차량·센터로 합적, 소물 박스 합적 누락, 타 시공팀 PLT 출고)
- W-05: PLT 평탄화·이동 중 누락 (평탄화 중 누락, 이동 중 누락)
- W-06: 작업 중 제품 파손 (상차 중 파손, 피킹 중 파손, 분배 중 파손, 랩핑 작업 중 추락)
- W-07: 재고 관리 미흡 (재고 허수, 전산-실물 불일치)

【2】시공팀 귀책
- I-01: 시공팀 오상차/미상차 (시공 상차 시 적재 실수, 미상차)
- I-02: 시공팀 분실 (시공팀이 제품 분실)
- I-03: 시공팀 오등록 (수주·현장 정보 오등록)
- I-04: 시공 중 파손·지연 공유 누락 (원 시공 시 파손 확인되었으나 물류 공유 X)
- I-05: 시공팀 회수·확인 미진행 (최초 조치 후 회수 미진행, 회수 확인 안됨)

【3】전산/시스템 오류
- S-01: WMS 작업 누락·오류 (WAVE, CLAC 등 WMS 작업 오류)
- S-02: 운송 전산 오류 (운송 작업 불가, 운송 작업 누락)
- S-03: 수주·A/S 전산 미등록 (A/S 수주 미등록, 작업 지시 누락)

【4】서류/정보 불일치
- D-01: 마감 이후 일정 변경 미공유 (마감 후 시공팀 변경, 마감 이후 변경 미공유)
- D-02: 긴급·특이건 공유 누락 (긴급 AS 접수 후 미공유, A/S 일정 변경 미공유)
- D-03: 재일정·연기 오기재 (재일정 오기재)
- D-04: 연기건 미분배·미공유 (연기건 미분배, 연기 제품 오적재)

【5】공급망 이슈
- V-01: 재고 부족 (재고 부족, 부족량 CUT)
- V-02: 화주사 미입고·입고 지연 (화주사 미입고, 입고 지연, 제품 미입고)
- V-03: 생산 지연 (생산처 지연)

【6】프로세스 미준수
- P-01: 포장·랩핑 불량 (PLT 랩핑 부족으로 운송 중 파손, 포장 불량, 테이핑 불량)
- P-02: 적재 불량 (적재 상태 부실)
- P-03: 출고 전 박스·제품 훼손 (박스 훼손, 파손 제품 출고, 검수 불량)

【7】기타
- E-01: 원인 파악 불가 (원인 불명, 귀책 불분명, CCTV 확인 불가)
- E-02: 고객 귀책 (고객 취소·환불·반품, 고객 요청, 수주 삭제)
- E-03: 정상 출고 (이슈 없는 정상건, 선출고 후 회수 완료)
- E-04: 화주사·직출·택배 품목 (택배 품목, 업체 직송, 화주사 직출, 품질관리팀 인계)
`.trim()

const DETAIL_TO_MAJOR: Record<string, string> = {
  'W-01': '현장 운영 귀책', 'W-02': '현장 운영 귀책', 'W-03': '현장 운영 귀책',
  'W-04': '현장 운영 귀책', 'W-05': '현장 운영 귀책', 'W-06': '현장 운영 귀책', 'W-07': '현장 운영 귀책',
  'I-01': '시공팀 귀책', 'I-02': '시공팀 귀책', 'I-03': '시공팀 귀책',
  'I-04': '시공팀 귀책', 'I-05': '시공팀 귀책',
  'S-01': '전산/시스템 오류', 'S-02': '전산/시스템 오류', 'S-03': '전산/시스템 오류',
  'D-01': '서류/정보 불일치', 'D-02': '서류/정보 불일치', 'D-03': '서류/정보 불일치', 'D-04': '서류/정보 불일치',
  'V-01': '공급망 이슈', 'V-02': '공급망 이슈', 'V-03': '공급망 이슈',
  'P-01': '프로세스 미준수', 'P-02': '프로세스 미준수', 'P-03': '프로세스 미준수',
  'E-01': '기타', 'E-02': '기타', 'E-03': '기타', 'E-04': '기타',
}

// ============================================================
// 🤖 프롬프트 빌더 (✨ v4: AI Log 대응)
// ============================================================
function buildBatchPrompt(records: any[]): string {
  const recordsText = records.map(record => `[사고 ID: ${record.id}]
- 조치결과: ${record.action_result ?? '(미상)'}
- 이슈수량: ${record.issue_qty ?? 0}
- 품목코드: ${record.item_code ?? '(미상)'}
- 브랜드: ${record.brand ?? '(미상)'}
- 서비스센터: ${record.service_center ?? '(미상)'}
- 시공/AS: ${record.service_type ?? '(미상)'}
- ZONE: ${record.zone ?? '(미상)'}
- 작업자: ${record.worker_name ?? '(미상)'}
- 주야구분: ${record.shift_type ?? '(미상)'}
- 원인메모: ${record.cause_detail ?? '(없음)'}
- 조치내용: ${record.action_content ?? '(없음)'}`).join('\n\n========================\n\n')

  return `당신은 물류 사고 원인 분석 전문가입니다.
아래 사고 데이터 ${records.length}건을 개별적으로 분석하고, 반드시 지정된 JSON 배열(Array) 형식으로 한 번에 응답하세요.

${CATEGORY_SYSTEM}

[출력 형식 — 반드시 아래 형태의 JSON 배열([])만 출력할 것]
[
  {
    "id": "입력받은 사고 ID를 그대로 출력 (예: 12345)",
    "detail_code": "위 29개 코드 중 하나 (예: W-01)",
    "summary": "50자 이내의 구체적 원인 서술",
    "keywords": ["핵심키워드1", "핵심키워드2"],
    "confidence": "high | medium | low",
    "low_confidence_reason": "confidence가 low인 경우 불확실한 구체적 사유 기재 (아니면 빈 문자열)"
  }
]

[판단 규칙]
1. 배열의 객체 수는 반드시 요청받은 사고 수(${records.length}개)와 동일해야 합니다.
2. detail_code는 위 목록의 코드 그대로 사용하세요.
3. summary는 행동/상태 위주로 서술하세요.
4. 정보가 충분하면 high, 애매하면 medium, 내용이 부족하여 판단이 불가하면 E-01 코드와 함께 confidence를 low로 지정하세요. low로 지정한 경우 low_confidence_reason에 확신할 수 없는 이유를 반드시 작성하세요.
5. 정상 출고건은 무조건 E-03으로 분류하세요.

[사고 데이터 목록 (${records.length}건)]
${recordsText}

JSON 응답:`
}

// ============================================================
// 🔧 JSON 방어 파싱 (✨ v3: Array 추출 지원)
// ============================================================
function safeJsonParseArray(text: string): any[] | null {
  if (!text) return null
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  // 배열 형태를 1순위로 추출
  const match = cleaned.match(/\[[\s\S]*\]/)
  if (match) cleaned = match[0]
  try {
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : null
  } catch (e) {
    return null
  }
}

const FAILURE_MARKER = '__AI_ANALYSIS_FAILED__'

function failureResult(id: string, reason: string) {
  return {
    id,
    ai_analyzed_cause: '기타',
    ai_cause_detail: 'E-01',
    ai_cause_summary: `${FAILURE_MARKER}:${reason}`.substring(0, 200),
    ai_keywords: [],
    ai_confidence: 'low',
    low_confidence_reason: `시스템 장애: ${reason}`,
    _failed: true,
  }
}

// ============================================================
// 🤖 Gemini 일괄 호출 (✨ v3: Batch 처리)
// ============================================================
async function analyzeBatch(records: any[], apiKey: string, retryCount = 0): Promise<any[]> {
  const prompt = buildBatchPrompt(records)
  
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1, // 배열 일관성을 위해 온도를 낮춤
            responseMimeType: "application/json" // JSON 모드 강제 적용
          },
        }),
      }
    )
    
    const result = await res.json()
    
    if (!result.candidates) {
      const errorCode = result.error?.code
      const errorMsg = result.error?.message || 'unknown error'
      
      if ((errorCode === 429 || errorCode === 503) && retryCount < 2) {
        const waitMs = 3000 * Math.pow(2, retryCount)
        console.warn(`⏳ 배치 재시도 ${retryCount + 1}/2, ${waitMs}ms 대기`)
        await new Promise(resolve => setTimeout(resolve, waitMs))
        return analyzeBatch(records, apiKey, retryCount + 1)
      }
      
      console.warn(`⚠️ API 응답 거부: ${errorCode}`)
      return records.map(r => failureResult(r.id, `API_ERROR_${errorCode}`))
    }
    
    const rawText = result.candidates[0]?.content?.parts?.[0]?.text
    const parsedArray = safeJsonParseArray(rawText)
    
    if (!parsedArray) {
      console.warn(`⚠️ JSON 배열 파싱 실패`)
      return records.map(r => failureResult(r.id, 'parse_array_fail'))
    }
    
    // 맵핑: AI가 누락한 데이터가 있을 경우를 대비해 원본 records 기준으로 재조립
    return records.map(record => {
      const aiData = parsedArray.find((item: any) => String(item.id) === String(record.id))
      
      if (!aiData || !aiData.detail_code) {
        return failureResult(record.id, 'ai_missed_record')
      }
      
      const detailCode = String(aiData.detail_code).toUpperCase().trim()
      const major = DETAIL_TO_MAJOR[detailCode] ?? '기타'
      const finalDetail = DETAIL_TO_MAJOR[detailCode] ? detailCode : 'E-01'
      
      const _original_text = `원인메모: ${record.cause_detail ?? ''} | 조치내용: ${record.action_content ?? ''}`;

      return {
        id: record.id,
        ai_analyzed_cause: major,
        ai_cause_detail: finalDetail,
        ai_cause_summary: String(aiData.summary ?? '').substring(0, 100),
        ai_keywords: Array.isArray(aiData.keywords) ? aiData.keywords.slice(0, 5).map((k: any) => String(k)) : [],
        ai_confidence: ['high', 'medium', 'low'].includes(aiData.confidence) ? aiData.confidence : 'low',
        low_confidence_reason: aiData.low_confidence_reason ? String(aiData.low_confidence_reason) : null,
        _original_text,
        _failed: false,
      }
    })
  } catch (err: any) {
    console.error(`❌ 배치 fetch 예외:`, err.message)
    return records.map(r => failureResult(r.id, `exception_${err.message?.substring(0, 50)}`))
  }
}

// ============================================================
// 🚀 메인 핸들러
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    let ids: string[] | null = null
    let forceReanalyze = false
    try {
      const body = await req.json()
      ids = body.ids ?? null
      forceReanalyze = body.forceReanalyze === true
    } catch (_) {}

    let query = supabase.from('logistics_accidents').select('*')
    if (ids && ids.length > 0) {
      query = query.in('id', ids)
      if (!forceReanalyze) query = query.is('ai_cause_detail', null)
    } else {
      query = query.eq('status', '등록 완료').is('ai_cause_detail', null).limit(50)
    }

    const { data: records, error: fetchError } = await query
    if (fetchError) throw fetchError
    
    if (!records || records.length === 0) {
      return new Response(
        JSON.stringify({ message: '분석할 대기 데이터가 없습니다.', processed_count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const MAX_LIMIT = 50 // 프론트와 맞춘 50건 제한
    const targetRecords = records.slice(0, MAX_LIMIT)
    const truncated = records.length > MAX_LIMIT

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY가 등록되지 않았습니다.')

    // ========================================================
    // 🚀 다중 배치(Batch) 직렬 분석 처리 (v3 핵심)
    // ========================================================
    const BATCH_SIZE = 10     // 10건을 1번의 API로 묶어서 발송
    const WAIT_MS = 1500      // API 호출 간 1.5초 휴식
    
    console.log(`🔍 총 ${targetRecords.length}건 분석 시작 (배치 단위: ${BATCH_SIZE})`)
    const analysisResults: any[] = []
    
    for (let i = 0; i < targetRecords.length; i += BATCH_SIZE) {
      const batch = targetRecords.slice(i, i + BATCH_SIZE)
      console.log(`📦 배치 전송: ${i + 1} ~ ${i + batch.length}건`)
      
      const batchResults = await analyzeBatch(batch, apiKey)
      analysisResults.push(...batchResults)
      
      // 구글 서버가 눈치채지 못하게 배치 사이에 잠깐씩 쉬어줍니다
      if (i + BATCH_SIZE < targetRecords.length) {
        await new Promise(resolve => setTimeout(resolve, WAIT_MS))
      }
    }

    // ========================================================
    // 💾 성공건만 DB 저장
    // ========================================================
    const successResults = analysisResults.filter(r => !r._failed)
    const failedResults = analysisResults.filter(r => r._failed)

    console.log(`✅ 성공: ${successResults.length}건, ⚠️ 실패: ${failedResults.length}건`)

    if (successResults.length > 0) {
      // 1. logistics_accidents 업데이트
      const updatePayload = successResults.map((r) => ({
        id: r.id,
        ai_analyzed_cause: r.ai_analyzed_cause,
        ai_cause_detail: r.ai_cause_detail,
        ai_cause_summary: r.ai_cause_summary,
        ai_keywords: r.ai_keywords,
        ai_confidence: r.ai_confidence,
        updated_at: new Date().toISOString(),
      }))

      const { error: upsertError } = await supabase
        .from('logistics_accidents')
        .upsert(updatePayload, { onConflict: 'id' })

      if (upsertError) throw upsertError

      // 2. ai_analysis_logs 에 로그 적재
      const logPayload = successResults.map((r) => ({
        source_menu: 'AccidentManagement',
        target_id: String(r.id),
        original_text: r._original_text,
        ai_analyzed_cause: r.ai_analyzed_cause,
        ai_cause_detail: r.ai_cause_detail,
        ai_cause_summary: r.ai_cause_summary,
        ai_confidence: r.ai_confidence,
        low_confidence_reason: r.low_confidence_reason
      }))

      const { error: logError } = await supabase
        .from('ai_analysis_logs')
        .insert(logPayload)

      if (logError) console.error('AI 로그 저장 실패:', logError)
    }

    const failureReasons = failedResults.reduce((acc: any, r) => {
      const reason = String(r.ai_cause_summary).replace(`${FAILURE_MARKER}:`, '').substring(0, 30)
      acc[reason] = (acc[reason] ?? 0) + 1
      return acc
    }, {})

    const confidenceStats = successResults.reduce((acc: any, r) => {
      acc[r.ai_confidence] = (acc[r.ai_confidence] ?? 0) + 1
      return acc
    }, {})

    let message = ''
    if (failedResults.length === 0) {
      message = truncated ? `최대 ${MAX_LIMIT}건 제한으로 ${targetRecords.length}건만 분석되었습니다.` : '분석 완료'
    } else {
      message = `${successResults.length}건 분석 성공, ${failedResults.length}건은 분석 불가 또는 누락되었습니다.`
    }

    return new Response(
      JSON.stringify({
        message,
        processed_count: successResults.length,
        failed_count: failedResults.length,
        confidence_stats: confidenceStats,
        failure_reasons: failureReasons,
        truncated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('🚨 에러 발생:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.details ?? null,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
