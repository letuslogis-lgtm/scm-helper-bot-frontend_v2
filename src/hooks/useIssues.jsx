import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

export const useIssues = (session) => {
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
            const { data, error } = await supabase.from('logistics_issues').select('*').order('id', { ascending: false });
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
        if (session) {
            fetchIssues();
        }
    }, [session]);

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
