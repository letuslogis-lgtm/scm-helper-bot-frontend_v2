// ===========================================================================
// 근무자 근태 관리 — 공용 상수
//   여러 파일에 흩어져 있던 업체/컬럼 정의를 이 한 곳에서 관리한다.
// ===========================================================================

// 사내협력사로 분류되는 실투입 업체명 (집계·통계의 협력사/도급사 판정 기준)
export const PARTNER_VENDORS = ['바로서비스', '하나물류', '에프스토리'];

export const isPartnerVendor = (vendor) => PARTNER_VENDORS.includes(vendor);

// 업로드 파일 → 업체 정의
//   id        : 내부 식별 코드 (detectVendor 결과)
//   label     : 업로드 모달의 버튼 표시명
//   display   : DB 저장용 실제 업체명 (vendor_name)
//   companyType: 사내협력사 / 외주도급사
//   keywords  : 파일명 자동 인식 키워드 (소문자·공백제거 기준)
export const VENDOR_DEFS = [
  { id: '협력사_바로서비스', label: '바로서비스', display: '바로서비스', companyType: '사내협력사', keywords: ['바로'] },
  { id: '협력사_하나물류',   label: '하나물류',   display: '하나물류',   companyType: '사내협력사', keywords: ['하나'] },
  { id: '협력사_에프스토리', label: '에프스토리', display: '에프스토리', companyType: '사내협력사', keywords: ['에프스토리', 'fstory'] },
  { id: '도급사1', label: 'IPC',     display: 'IPC',        companyType: '외주도급사', keywords: ['도급사1', 'ipc'] },
  { id: '도급사2', label: '한국사람들', display: '한국사람들', companyType: '외주도급사', keywords: ['도급사2', '한국사람들'] },
  { id: '도급사3', label: '도급사3',  display: 'JNT',        companyType: '외주도급사', keywords: ['도급사3'] },
];

const VENDOR_BY_ID = Object.fromEntries(VENDOR_DEFS.map(v => [v.id, v]));

// 파일명으로 업체 id 자동 인식
export const detectVendorId = (fileName) => {
  const clean = (fileName || '').toLowerCase().replace(/\s/g, '');
  for (const v of VENDOR_DEFS) {
    if (v.keywords.some(k => clean.includes(k))) return v.id;
  }
  return '';
};

export const vendorDisplay = (id) => VENDOR_BY_ID[id]?.display || '';
export const vendorCompanyType = (id) => VENDOR_BY_ID[id]?.companyType || '외주도급사';

// 일괄 수정(지원/파견) 시 선택 가능한 실투입 업체 목록
export const WORKED_VENDOR_OPTIONS = ['바로서비스', '하나물류', '에프스토리', 'IPC', '한국사람들', 'JNT'];

// 상세 내역 테이블 컬럼 정의 (테이블 UI 표준)
export const DETAIL_COLUMNS = [
  { label: '근무 일자',             key: 'work_date',       w: 110 },
  { label: '구분',                  key: 'company_type',    w: 80  },
  { label: '원 소속 업체',          key: 'vendor_name',     w: 130 },
  { label: '실 투입 (생산성 기준)', key: 'worked_vendor',   w: 160 },
  { label: '근무자명',              key: 'worker_name',     w: 100 },
  { label: '출근',                  key: 'go_work_time',    w: 90  },
  { label: '퇴근',                  key: 'leave_work_time', w: 90  },
  { label: '정상근무',              key: 'normal_hours',    w: 90  },
  { label: '연장근무',              key: 'overtime_hours',  w: 90  },
  { label: '총 시간',               key: 'work_hours',      w: 90  },
  { label: '특이사항(비고)',        key: 'remark',          w: 150 },
];

export const COL_STORAGE_KEY = 'letus_attendance_col';
