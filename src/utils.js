// 오늘로부터 30일 전의 날짜를 '2026-03-24' 형태로 반환
const getThirtyDaysAgo = () => {
    const date = new Date(Date.now() + 9 * 60 * 60 * 1000);
    date.setUTCDate(date.getUTCDate() - 30);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD 형식 (KST 기준)
};

// ----------------------------------------------------------------
// 📦 xlsx / xlsx-js-style 동적 로더
//    - xlsx 라이브러리는 ~1MB 라서 첫 로딩에 부담을 주므로,
//      엑셀 기능을 실제로 사용하는 시점에만 동적 import 해서 청크를 분리한다.
//    - 한 번 로드되면 모듈 캐시에 남아 재호출 시 즉시 반환.
// ----------------------------------------------------------------
let _xlsxPromise = null;
export function loadXLSX() {
    if (!_xlsxPromise) {
        _xlsxPromise = import('xlsx');
    }
    return _xlsxPromise;
}

let _xlsxStylePromise = null;
export function loadXLSXStyle() {
    if (!_xlsxStylePromise) {
        _xlsxStylePromise = import('xlsx-js-style');
    }
    return _xlsxStylePromise;
}