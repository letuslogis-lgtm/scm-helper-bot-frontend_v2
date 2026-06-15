// ===========================================================================
// 근태 파서 공용 헬퍼
// ===========================================================================

// 숫자 안전 파싱: 빈값/'-'/공백 → 0, 콤마 제거
export const safeParse = (val) => {
  if (!val || val === '-' || String(val).trim() === '') return 0;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

// 근무자 마스터 조회. 없으면 신규 근무자로 등록 예약(newWorkersMap)하고
// 임시 마스터 정보를 반환한다. (workerMap, newWorkersMap 은 ctx 통해 공유)
export const ensureWorker = (cleanName, displayName, ctx) => {
  let masterInfo = ctx.workerMap[cleanName];
  if (!masterInfo) {
    if (!ctx.newWorkersMap.has(cleanName)) {
      ctx.newWorkersMap.set(cleanName, {
        name: displayName, phone: '', company_type: ctx.companyType, vendor_name: ctx.vendor,
        employment_type: '현장직', workplace: '', managed_brand: '', task: '', support_status: '미지원', status: '재직',
      });
    }
    masterInfo = { supportStatus: '미지원', brand: '' };
    ctx.workerMap[cleanName] = masterInfo;
  }
  return masterInfo;
};

// 지원/파견 상태에 따른 실투입 업체 결정
export const resolveWorkedVendor = (masterInfo, vendor) => {
  const statusVal = masterInfo.supportStatus ? String(masterInfo.supportStatus).trim() : '미지원';
  return (statusVal !== '미지원' && statusVal !== '') ? statusVal : vendor;
};
