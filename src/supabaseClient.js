import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// For backwards compatibility since vibe-code might use window
window.supabase = supabase;

// ----------------------------------------------------------------
// 🛡️ Edge Function 호출 헬퍼
//    - functions.invoke 의 표준 패턴(에러 본문 추출 포함) 을 한 곳에 모음
//    - 사용: const data = await invokeFunction('user-admin', { action, payload })
// ----------------------------------------------------------------
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message || '요청 실패';
    try {
      const errBody = await error.context?.json?.();
      if (errBody?.error) message = errBody.error;
    } catch {
      // 응답 본문이 없거나 JSON 이 아닌 경우는 무시하고 기본 메시지를 사용
    }
    throw new Error(message);
  }
  return data;
}
