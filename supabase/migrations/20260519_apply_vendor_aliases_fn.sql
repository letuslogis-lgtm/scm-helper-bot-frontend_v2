-- ============================================================
-- vendor_aliases를 products.display_vendor에 적용하는 함수
-- alias 추가 후 이 함수만 호출하면 sync 없이 즉시 반영
-- 호출: SELECT apply_vendor_aliases();
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_vendor_aliases()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    updated_count integer;
    nulled_count  integer;
BEGIN
    -- 1) canonical_name이 있는 경우 → display_vendor 업데이트
    UPDATE public.products p
    SET display_vendor = va.canonical_name
    FROM public.vendor_aliases va
    WHERE (p.vendor = va.raw_name OR p.production_line = va.raw_name)
      AND va.canonical_name IS NOT NULL;
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    -- 2) canonical_name이 NULL인 경우 (제외 대상) → display_vendor NULL
    UPDATE public.products p
    SET display_vendor = NULL
    FROM public.vendor_aliases va
    WHERE (p.vendor = va.raw_name OR p.production_line = va.raw_name)
      AND va.canonical_name IS NULL;
    GET DIAGNOSTICS nulled_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'status',        'ok',
        'updated',       updated_count,
        'excluded',      nulled_count
    );
END;
$$;

-- 인증 사용자 실행 권한
GRANT EXECUTE ON FUNCTION public.apply_vendor_aliases() TO authenticated;
