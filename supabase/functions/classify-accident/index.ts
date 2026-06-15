// classify-accident v2 — 최소 버전 (DB 로깅 제외)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://scm-helper-bot-frontend-v2.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
]
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get('Origin') ?? ''
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// 호출자 인증 검증 — 로그인한 사용자만 허용. 통과 시 null, 실패 시 Response 반환
async function requireAuth(req: Request): Promise<Response | null> {
  const corsHeaders = buildCorsHeaders(req)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return null
}

function ruleClassify(d: string): { cause_type: string | null, action_result: string | null, responsible_dept: string | null } | null {
  const s = d.toLowerCase()

  const mfgKw = ['생산 미출','생산미출','오포장','제조 오염','제품 불량','밴딩 불량','테이핑 불량','패키징 이슈','검수 불량','생산 지연','포장 불량','제조불량']
  if (mfgKw.some(k => s.includes(k))) return { cause_type: '제조/생산 이슈', action_result: '제조/생산 이슈', responsible_dept: '구매/생산' }

  // 운송사업팀 프로세스 미준수 (물류 현장 작업자 아님)
  const transportKw = ['운송 누락','운송 작업 누락','간선 누락','간선 작업 누락']
  if (transportKw.some(k => s.includes(k))) return { cause_type: '프로세스 미준수', action_result: '미출고', responsible_dept: '운송사업팀' }

  // WMS·전산 오류로 인한 미출고
  const wmsKw = ['wms','wave','clac','출고 누락','운송 작업 불가','운송 전산','작업 오류']
  if (wmsKw.some(k => s.includes(k))) return { cause_type: '전산/시스템 오류', action_result: '미출고', responsible_dept: '브랜드/3PL고객사' }

  const sysKw = ['오등록','수주 삭제','수주 내 해당 제품','as 조치일','전산 오류','시스템 오류']
  if (sysKw.some(k => s.includes(k))) return { cause_type: '전산/시스템 오류', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }

  if (['직출 진행','직출 협의','직출하기로','현장 직출','센터 직출'].some(k => s.includes(k)))
    return { cause_type: '서류/정보 불일치', action_result: '현장직출', responsible_dept: '브랜드/3PL고객사' }

  if (['대리점','화주사'].some(k => s.includes(k)) && ['오등록','잘못','없음','누락','오기재'].some(k => s.includes(k)))
    return { cause_type: '서류/정보 불일치', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }

  if (['화주사 미입고','화주사 입고','화주사 지연'].some(k => s.includes(k)))
    return { cause_type: '재고/수량 이슈', action_result: '미출고', responsible_dept: '브랜드/3PL고객사' }

  if (['회수 시공건','수주건이 없음','당일 회수','회수 시공 확인','회수건',
       '회수 시공 없음','회수 수주 없음','회수건 없음','회수시공 없음'].some(k => s.includes(k)))
    return { cause_type: '프로세스 미준수', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }

  // 회수 관련 + 없음/미등록 패턴
  if (s.includes('회수') && ['없음','미등록','누락','미확인'].some(k => s.includes(k)))
    return { cause_type: '프로세스 미준수', action_result: '출고 없음', responsible_dept: '브랜드/3PL고객사' }

  if (['간선차량','이동 중 파손','운송 중 파손'].some(k => s.includes(k)))
    return { cause_type: '작업자 귀책', action_result: '물류파손', responsible_dept: '운송사업팀' }

  if (['피킹 누락','오피킹','미상차','오합적','피킹 미스'].some(k => s.includes(k)))
    return { cause_type: '작업자 귀책', action_result: '미출고', responsible_dept: '물류사업1팀' }

  if (['상차 중 파손','작업 중 파손','피킹 중 파손','분배 중 파손'].some(k => s.includes(k)))
    return { cause_type: '작업자 귀책', action_result: '물류파손', responsible_dept: '물류사업1팀' }

  if (['고객 변심','고객 반품','고객 취소','고객 요청','환불'].some(k => s.includes(k)))
    return { cause_type: '기타', action_result: null, responsible_dept: '브랜드/3PL고객사' }

  if (['시공 중 파손','시공팀 파손'].some(k => s.includes(k)))
    return { cause_type: '시공팀 귀책', action_result: '시공파손', responsible_dept: null }

  return null
}

const AI_PROMPT = `당신은 물류 상차 이슈 분류 전문가입니다.
상세 내역 텍스트를 읽고 '발생원인', '확인결과', '귀책부서'를 추천하세요.

발생원인: 작업자 귀책 / 시공팀 귀책 / 전산/시스템 오류 / 서류/정보 불일치 / 재고/수량 이슈 / 제조/생산 이슈 / 프로세스 미준수 / 기타
확인결과: 정상출고 / 출고 없음 / 미출고 / 오출고 / 과출고 / 물류파손 / 시공파손 / 현장직출 / 센터직출 / 납기연기(건) / 납기연기(품목) / 제품분실 / 제조/생산 이슈 / 기타
귀책부서: 물류사업1팀 / 물류사업2팀 / 운송사업팀 / 컨택센터 / 라스트마일1팀 / 라스트마일2팀 / 구매/생산 / 브랜드/3PL고객사 / 기타

핵심 규칙:
- 작업자 귀책(피킹·상차·분배 실수) → 귀책부서는 무조건 물류사업1팀
- 운송 누락·간선 문제 → 프로세스 미준수 / 운송사업팀
- 시공팀 실수 → 라스트마일1팀 또는 라스트마일2팀

판단이 어렵더라도 반드시 가장 가능성 높은 값을 추천하세요.
{"cause_type":"값","action_result":"값","responsible_dept":"값","confidence":"high|medium|low","reason":"판단 근거"}`

async function aiClassify(detail: string, apiKey: string) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${AI_PROMPT}\n\n상세 내역: ${detail}\n\nJSON:` }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    )
    const result = await res.json()
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    const p = JSON.parse(text.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim())
    return { cause_type: p.cause_type || null, action_result: p.action_result || null, responsible_dept: p.responsible_dept || null, confidence: p.confidence || 'medium' }
  } catch { return null }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authFail = await requireAuth(req)
  if (authFail) return authFail

  try {
    const { cause_detail } = await req.json()
    if (!cause_detail) return new Response(JSON.stringify({ error: 'cause_detail 필요' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const rule = ruleClassify(cause_detail)
    if (rule) return new Response(JSON.stringify({ ...rule, confidence: 'high', method: 'rule' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) return new Response(JSON.stringify({ cause_type: null, action_result: null, responsible_dept: null, confidence: 'low', method: 'none' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const ai = await aiClassify(cause_detail, apiKey)
    return new Response(
      JSON.stringify(ai ? { ...ai, method: 'ai' } : { cause_type: null, action_result: null, responsible_dept: null, confidence: 'low', method: 'failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown'
    console.error('오류:', msg)
    return new Response(JSON.stringify({ error: '분류 처리 중 오류가 발생했습니다.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
