// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS Headers 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS Preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { startDate, endDate, totalCount, topSku, topZone, topCause } = await req.json()

    // Supabase 환경 변수에서 OpenAI API Key 가져오기
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set in environment variables.")
    }

    const prompt = `당신은 대한민국 최고 수준의 물류 센터 전문 데이터 사이언티스트이자 운영 컨설턴트입니다.
현재 조회된 기간(${startDate} ~ ${endDate}) 동안 총 ${totalCount}건의 상차 이슈 및 사고가 발생했습니다.

[핵심 요약 데이터]
- 요주의 품목 (가장 에러 빈도가 높은 품목): ${topSku}
- 사고 핫스팟 (가장 에러가 많이 발생하는 구역): ${topZone}
- 주요 근본 원인 (AI가 사전 분석한 가장 큰 원인): ${topCause}

위 데이터를 바탕으로 현재 물류 프로세스의 문제점을 진단하고, 현장 작업자와 관리자가 즉각 실행할 수 있는 핵심 개선 방안(Action Item) 3가지를 도출해주세요.
답변은 전문적이고 명확한 어조로 작성하되, 마크다운(Markdown) 문법을 활용하여 가독성 높게 포맷팅해주세요. (예: 볼드체, 넘버링, 줄바꿈 등)`

    // API Key 종류에 따라 엔드포인트와 모델을 자동 분기 (OpenAI vs Gemini)
    let apiUrl = 'https://api.openai.com/v1/chat/completions';
    let aiModel = 'gpt-4o-mini'; // 기본 OpenAI 모델

    if (apiKey.startsWith('AIza')) {
      // 구글 Gemini API Key인 경우 (OpenAI 호환 엔드포인트 사용)
      apiUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
      aiModel = 'gemini-2.5-flash'; // 사용자의 요청에 따라 종량제 등록 후 테스트할 2.5 플래시 모델로 고정
    }

    // AI API 호출 (스트리밍)
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: 'system', content: 'You are a professional logistics data analyst.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        stream: true, // 🌟 스트리밍 활성화
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    // 스트리밍 응답을 그대로 클라이언트로 파이프(전달)
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('Error in generate-insight-report:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
