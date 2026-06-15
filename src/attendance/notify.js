// ===========================================================================
// 근무자 근태 관리 — 알림/에러 처리 통일
//   기존에 alert() / console.error() 가 무원칙하게 섞여 있던 것을
//   이 한 곳을 통해 호출하도록 표준화한다. (추후 토스트 UI 로 교체 용이)
// ===========================================================================

export const notifySuccess = (msg) => alert(msg);
export const notifyError = (msg) => alert(msg);
export const notifyConfirm = (msg) => window.confirm(msg);

// 콘솔 에러 로깅 (사용자에게는 안 보이는 디버그용)
export const logError = (context, err) => {
  console.error(`[근태] ${context}:`, err?.message || err);
};
