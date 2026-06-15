// ===========================================================================
// 근태 데이터 훅
//   - 근무자 마스터(workers) 1회 로드 → workerMasterMap
//   - worker_attendance 를 [fetchStart, fetchEnd] 범위로만 DB 조회 (날짜 필터를
//     쿼리에 직접 적용해 전체 스캔 방지)
// ===========================================================================
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient.js';
import { logError } from './notify.js';

// 출/퇴근 또는 근무시간이 실제로 있는 행만 유효 데이터로 간주
const cleanRows = (rows) => rows.filter(row => {
  const validStart = row.start_time && String(row.start_time).trim() !== '' && String(row.start_time).trim() !== ':';
  const validEnd = row.end_time && String(row.end_time).trim() !== '' && String(row.end_time).trim() !== ':';
  return validStart || validEnd || Number(row.work_hours) > 0;
});

export function useAttendance(fetchStart, fetchEnd) {
  const [attendanceData, setAttendanceData] = useState([]);
  const [workerMasterMap, setWorkerMasterMap] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // 근무자 마스터 (이름 → 고용형태/근무지/브랜드)
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('workers').select('name, employment_type, workplace, managed_brand');
        if (data) {
          const map = {};
          data.forEach(w => {
            map[w.name.replace(/\s/g, '')] = {
              type: w.employment_type,
              location: w.workplace,
              brand: w.managed_brand || '미지정/공통',
            };
          });
          setWorkerMasterMap(map);
        }
      } catch (err) { logError('마스터 정보 로드 실패', err); }
    })();
  }, []);

  const reload = useCallback(async () => {
    if (!fetchStart || !fetchEnd) return;
    setIsLoading(true);
    try {
      let allData = [];
      let hasMore = true;
      let page = 0;
      const pageSize = 1000;
      while (hasMore) {
        const { data, error } = await supabase
          .from('worker_attendance')
          .select('*')
          .gte('work_date', fetchStart)
          .lte('work_date', fetchEnd)
          .order('work_date', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allData = allData.concat(data);
          page++;
          if (data.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      setAttendanceData(cleanRows(allData));
    } catch (err) {
      logError('근태 조회 실패', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchStart, fetchEnd]);

  useEffect(() => { reload(); }, [reload]);

  return { attendanceData, workerMasterMap, isLoading, reload };
}
