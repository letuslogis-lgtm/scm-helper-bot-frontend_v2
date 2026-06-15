// ===========================================================================
// 근태 파서 디스패처
//   업체 id 에 따라 알맞은 파서를 호출한다.
//   각 파서는 { records, count, error } 를 반환하고, ctx 의 workerMap /
//   newWorkersMap 을 통해 신규 근무자 등록 정보를 공유한다.
// ===========================================================================
import { parseIPC } from './parseIPC.js';
import { parseKoreanPeople } from './parseKoreanPeople.js';
import { parsePartner } from './parsePartner.js';

export function parseVendorFile({ vendorId, data, isTextFile, XLSX, ctx }) {
  if (vendorId === '도급사1' || vendorId === 'IPC') {
    return parseIPC({ data, isTextFile, XLSX, ctx });
  }
  if (vendorId === '도급사2' || vendorId === '한국사람들') {
    return parseKoreanPeople({ data, isTextFile, XLSX, ctx });
  }
  // 그 외(사내협력사, 도급사3 등)는 공통 세로형 파서
  return parsePartner({ data, isTextFile, XLSX, ctx });
}
