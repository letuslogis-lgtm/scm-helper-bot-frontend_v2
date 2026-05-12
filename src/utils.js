// 오늘로부터 30일 전의 날짜를 '2026-03-24' 형태로 반환
const getThirtyDaysAgo = () => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD 형식
};