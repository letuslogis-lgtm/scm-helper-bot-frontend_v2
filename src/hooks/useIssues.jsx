import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

export const useIssues = (session, userProfile) => {
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [accidentDrillDownFilters, setAccidentDrillDownFilters] = useState(null);

    const today = new Date().toISOString().split("T")[0];
    const [savedListFilters, setSavedListFilters] = useState({
        brand: '전체', status: '전체', startDate: today, endDate: today, searchType: '품목코드', searchValue: '', teams: '전체'
    });

    const fetchIssues = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('logistics_issues').select('*').order('id', { ascending: false });
            // 사용자 역할이면 본인 팀에 이관된 건만 조회
            if (userProfile?.role === '사용자' && userProfile?.team) {
                query = query.eq('assigned_team', userProfile.team);
            }
            const { data, error } = await query;
            if (error) throw error;
            setIssues(data || []);
        } catch (error) {
            console.error('Supabase fetch exception:', error.message || error);
            setIssues([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // userProfile 로드 완료 후 한 번만 조회 (역할 기반 필터 정확히 적용)
        if (session && userProfile) {
            fetchIssues();
        }
    }, [session, userProfile?.id]);

    return {
        issues,
        isLoading,
        accidentDrillDownFilters,
        setAccidentDrillDownFilters,
        savedListFilters,
        setSavedListFilters,
        fetchIssues
    };
};
