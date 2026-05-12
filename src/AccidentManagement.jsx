// ============================================================
// 📌 호환성 wrapper (기존 import 경로 유지를 위해 re-export 만 수행)
//   원래의 두 거대 컴포넌트는 다음 파일로 분리되었습니다:
//     - AccidentDashboard.jsx
//     - AccidentList.jsx
//   모달 3종(AccidentModal / AccidentBulkEditModal / AccidentUploadModal)은
//   이미 AccidentModals.jsx 에 있으므로 동일 경로로 재노출합니다.
// ============================================================

export { AccidentDashboard } from './AccidentDashboard.jsx';
export { AccidentList } from './AccidentList.jsx';
export { AccidentModal, AccidentBulkEditModal, AccidentUploadModal } from './AccidentModals.jsx';
