// ============================================================
// 📌 Supabase Edge Function: submit-mobile-issue (v1)
// ============================================================
// 모바일 PWA에서 로그인 없이 입고 특이사항을 등록하기 위한 게이트웨이.
// service_role 키를 클라이언트에 노출하지 않고, 서버 측에서 입력
// 검증을 거친 후 Storage 업로드 + logistics_issues INSERT 를 수행.
//
// [엔드포인트]  POST /submit-mobile-issue
//
// [요청 Body]
//   {
//     brand:        string,   // BRANDS 화이트리스트 중 하나
//     issue_type:   string,   // ISSUE_TYPES 화이트리스트 중 하나
//     product_code: string?,  // optional
//     vendor:       string?,  // optional
//     detail:       string?,  // optional, 최대 5000자
//     photos: [
//       { base64: string, mimeType?: string }   // base64는 data: 접두사 없이 순수 인코딩만
//     ]
//   }
//
// [응답]  { ok: true, reception_no, issue_id }  |  { error: string }
//
// [보안]
//   - 익명 호출 허용 (deploy 시 --no-verify-jwt)
//   - 화이트리스트 검증 + 길이/개수/용량 제한으로 봇 스팸 차단
//   - service_role 키는 서버 환경변수에만 존재
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---- 화이트리스트 (MobileIssueRegister.jsx 와 동일하게 유지) ----
const BRANDS = new Set(['퍼시스', '일룸', '슬로우베드', '데스커', '시디즈', '알로소'])
const ISSUE_TYPES = new Set([
  '계획 없음/누락',
  '수량 부족 (계획>실물)',
  '과입고 (계획<실물)',
  '미입고',
  '파손·불량',
  '바코드 오류',
  '포장 불량·혼적',
  '표기·규격 미흡',
  '반송품 처리',
  '오반품·오입고',
  '전산-실물 불일치',
  'WMS·전산 오류',
  '기타 특이사항',
])

const MAX_PHOTOS = 5
const MAX_PHOTO_BYTES = 2 * 1024 * 1024 // 개당 2MB (클라이언트가 압축한 후 보내므로 충분)
const MAX_DETAIL_LEN = 5000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function generateReceptionNo(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const rand = Math.floor(Math.random() * 900 + 100)
  return `M${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${rand}`
}

function base64ToBytes(b64: string): Uint8Array {
  // data:image/...;base64, 접두사가 있으면 떼어낸다
  const cleaned = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('[submit-mobile-issue] missing env vars')
      return json({ error: 'Server misconfigured' }, 500)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ---- 1) Body 파싱 ----
    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON body' }, 400)
    }

    // 요청자 식별 — JWT → profiles 테이블에서 이름 조회 (실패해도 등록은 허용)
    let reporterName = '모바일 작업자'
    try {
      const authHeader = req.headers.get('Authorization') ?? ''
      const token = authHeader.replace('Bearer ', '')
      if (token) {
        const { data: { user } } = await admin.auth.getUser(token)
        if (user?.id) {
          const { data: profile } = await admin.from('profiles').select('name').eq('id', user.id).single()
          if (profile?.name) reporterName = profile.name
        }
      }
    } catch { /* 인증 실패 시 기본값 유지 */ }

    const brand = String(body.brand ?? '').trim()
    const issueType = String(body.issue_type ?? '').trim()
    const productCode = body.product_code ? String(body.product_code).trim() : null
    const vendor = body.vendor ? String(body.vendor).trim() : null
    const detail = String(body.detail ?? '').trim()
    const photos = Array.isArray(body.photos)
      ? (body.photos as Array<{ base64?: string; mimeType?: string }>)
      : []

    // ---- 2) 화이트리스트 + 길이 검증 ----
    if (!BRANDS.has(brand)) return json({ error: `Invalid brand: ${brand}` }, 400)
    if (!ISSUE_TYPES.has(issueType)) return json({ error: `Invalid issue_type: ${issueType}` }, 400)
    if (detail.length > MAX_DETAIL_LEN) {
      return json({ error: `detail too long (max ${MAX_DETAIL_LEN} chars)` }, 400)
    }
    if (photos.length > MAX_PHOTOS) {
      return json({ error: `too many photos (max ${MAX_PHOTOS})` }, 400)
    }

    // ---- 3) 사진 업로드 ----
    const photoUrls: string[] = []
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]
      if (!photo?.base64) continue

      let bytes: Uint8Array
      try {
        bytes = base64ToBytes(photo.base64)
      } catch {
        return json({ error: `photo[${i}]: invalid base64` }, 400)
      }
      if (bytes.byteLength > MAX_PHOTO_BYTES) {
        return json({ error: `photo[${i}]: too large (max ${MAX_PHOTO_BYTES} bytes)` }, 400)
      }

      const mime = photo.mimeType ?? 'image/jpeg'
      const ext = mime.includes('/') ? mime.split('/')[1] : 'jpg'
      const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext.toLowerCase()) ? ext : 'jpg'
      const filePath = `mobile/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${safeExt}`

      const { error: uploadErr } = await admin.storage
        .from('issue_images')
        .upload(filePath, bytes, { contentType: mime, upsert: false })

      if (uploadErr) {
        console.error('[submit-mobile-issue] upload failed:', uploadErr.message)
        return json({ error: `Upload failed: ${uploadErr.message}` }, 500)
      }

      const { data: urlData } = admin.storage.from('issue_images').getPublicUrl(filePath)
      photoUrls.push(urlData.publicUrl)
    }

    // ---- 4) logistics_issues INSERT ----
    const reception_no = generateReceptionNo()
    const { data: inserted, error: insertErr } = await admin
      .from('logistics_issues')
      .insert([{
        reception_no,
        brand,
        issue_type: issueType,
        product_code: productCode || null,
        vendor: vendor || null,
        request_content: detail,
        reporter: reporterName,
        status: '조치대기',
        image_url: photoUrls.length > 0 ? photoUrls.join(',') : null,
        created_at: new Date().toISOString(),
      }])
      .select('id')
      .single()

    if (insertErr) {
      console.error('[submit-mobile-issue] insert failed:', insertErr.message)
      return json({ error: `Insert failed: ${insertErr.message}` }, 500)
    }

    return json({
      ok: true,
      reception_no,
      issue_id: inserted?.id ?? null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[submit-mobile-issue] exception:', message)
    return json({ error: message }, 500)
  }
})
