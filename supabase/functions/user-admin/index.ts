// ============================================================
// 📌 Supabase Edge Function: user-admin (v1)
// ============================================================
// 클라이언트에서 service_role 키 노출 없이 Auth Admin API를 안전하게 호출하기 위한 게이트웨이.
//
// [엔드포인트]
//   POST /user-admin
//   Body: { action, payload }
//
// [지원 액션]
//   - "create"         : 신규 사용자 생성        (관리자만)
//   - "delete"         : 사용자 영구 삭제        (관리자만, 본인 삭제 금지)
//   - "updatePassword" : 비밀번호 변경           (관리자 OR 본인)
//
// [보안]
//   1. Authorization 헤더의 JWT로 호출자 신원 확인
//   2. profiles.role 조회로 권한 검증
//   3. 통과 시에만 service_role 클라이언트로 admin API 호출
// ============================================================

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

const ADMIN_ROLES = ['관리자', '최고관리자']

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[user-admin] missing env vars')
      return json(req, { error: 'Server misconfigured' }, 500)
    }

    // ---- 1) 호출자 인증 ----
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(req, { error: 'Unauthorized: missing Authorization header' }, 401)

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller) {
      return json(req, { error: 'Unauthorized: invalid token' }, 401)
    }

    // ---- 2) Service role 클라이언트 (실제 admin 작업용) ----
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ---- 3) 호출자 권한 조회 ----
    const { data: callerProfile, error: profileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileErr) {
      console.warn('[user-admin] caller profile lookup failed:', profileErr.message)
    }
    const isAdmin = ADMIN_ROLES.includes(callerProfile?.role ?? '')

    // ---- 4) Body 파싱 ----
    let body: { action?: string; payload?: Record<string, unknown> }
    try {
      body = await req.json()
    } catch {
      return json(req, { error: 'Invalid JSON body' }, 400)
    }
    const action = body.action
    const payload = (body.payload ?? {}) as Record<string, unknown>

    // ---- 5) 액션 라우팅 ----
    switch (action) {
      // ---------------------------------------------------------
      // 신규 사용자 생성 (관리자 전용)
      // ---------------------------------------------------------
      case 'create': {
        if (!isAdmin) return json(req, { error: 'Forbidden: admin only' }, 403)

        const email = String(payload.email ?? '').trim()
        const password = String(payload.password ?? '')
        const emailConfirm = payload.email_confirm !== false

        if (!email || !password) {
          return json(req, { error: 'email and password are required' }, 400)
        }
        if (password.length < 6) {
          return json(req, { error: 'Password must be at least 6 characters' }, 400)
        }

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: emailConfirm,
        })
        if (error) return json(req, { error: error.message }, 400)
        return json(req, { user: data.user })
      }

      // ---------------------------------------------------------
      // 사용자 영구 삭제 (관리자 전용, 본인 삭제 금지)
      // ---------------------------------------------------------
      case 'delete': {
        if (!isAdmin) return json(req, { error: 'Forbidden: admin only' }, 403)

        const userId = String(payload.userId ?? '').trim()
        if (!userId) return json(req, { error: 'userId is required' }, 400)
        if (userId === caller.id) {
          return json(req, { error: 'Cannot delete your own account' }, 400)
        }

        const { error: authDelErr } = await admin.auth.admin.deleteUser(userId)
        if (authDelErr) return json(req, { error: authDelErr.message }, 400)

        // profiles 테이블도 동시 삭제 (cascade가 안 걸려 있을 경우 대비)
        const { error: profileDelErr } = await admin
          .from('profiles')
          .delete()
          .eq('id', userId)
        if (profileDelErr) {
          // auth는 이미 지워졌으니 경고만 — 호출자 입장에서는 성공으로 처리
          console.warn('[user-admin] profile delete warning:', profileDelErr.message)
        }

        return json(req, { ok: true })
      }

      // ---------------------------------------------------------
      // 비밀번호 변경 (관리자 OR 본인)
      // ---------------------------------------------------------
      case 'updatePassword': {
        const userId = String(payload.userId ?? '').trim()
        const password = String(payload.password ?? '')

        if (!userId || !password) {
          return json(req, { error: 'userId and password are required' }, 400)
        }
        if (password.length < 6) {
          return json(req, { error: 'Password must be at least 6 characters' }, 400)
        }

        // 본인이거나 관리자만 허용
        if (!isAdmin && userId !== caller.id) {
          return json(req, { error: 'Forbidden: can only change own password' }, 403)
        }

        const { error } = await admin.auth.admin.updateUserById(userId, { password })
        if (error) return json(req, { error: error.message }, 400)
        return json(req, { ok: true })
      }

      // ---------------------------------------------------------
      default:
        return json(req, { error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    // 원본 에러는 서버 로그에만 남기고 클라이언트엔 일반 메시지만 노출
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[user-admin] exception:', message)
    return json(req, { error: '요청 처리 중 오류가 발생했습니다.' }, 500)
  }
})
