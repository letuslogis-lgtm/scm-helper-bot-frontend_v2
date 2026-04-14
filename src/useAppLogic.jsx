import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase, adminSupabase } from './supabaseClient.js';



const useAppLogic = () => {
    // 1. 상태 관리
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState('home');
    const [issues, setIssues] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [selfEditTarget, setSelfEditTarget] = useState(null);
    const [notifications, setNotifications] = useState([]);
    const [isNotiOpen, setIsNotiOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [accidentDrillDownFilters, setAccidentDrillDownFilters] = useState(null);

    const [favorites, setFavorites] = useState(() => {
        const savedFavs = localStorage.getItem('letus_favorites');
        return savedFavs ? JSON.parse(savedFavs) : [];
    });

    const today = new Date().toISOString().split("T")[0];
    const [savedListFilters, setSavedListFilters] = useState({
        brand: '전체', status: '전체', startDate: today, endDate: today, searchType: '품목코드', searchValue: ''
    });

    // 2. 주요 액션 함수들
    const toggleFavorite = (pageId) => {
        setFavorites(prev => {
            const newFavs = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId];
            localStorage.setItem('letus_favorites', JSON.stringify(newFavs));
            return newFavs;
        });
    };

    const handleNotiClick = (notiId, filterObj) => {
        setNotifications(prev => prev.map(n => n.id === notiId ? { ...n, read: true, read_at: new Date().getTime() } : n));
        handleDrillDown(filterObj);
        setIsNotiOpen(false);
    };

    const handleMarkAllAsRead = () => {
        const now = new Date().getTime();
        setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: now })));
    };

    const handleLogout = async () => {
        await window.supabase.auth.signOut();
        setUserProfile(null);
        setSession(null);
    };

    const handleDrillDown = (filterObj) => {
        setSavedListFilters(prev => ({
            ...prev, brand: filterObj.brand || '전체', status: filterObj.status || '전체',
            startDate: filterObj.startDate || prev.startDate, endDate: filterObj.endDate || prev.endDate
        }));
        setCurrentPage('list');
    };

    // ⭕ 수정 후 (useAppLogic.jsx)
    const handleAccidentDrillDown = (filterObj) => {
        setAccidentDrillDownFilters({
            brands: filterObj.brands || [],
            statuses: filterObj.statuses || [],
            isDelayed: filterObj.isDelayed || '전체',
            workers: filterObj.workers || [],
            zones: filterObj.zones || [],
            aiCauses: filterObj.aiCauses || [],
            searchType: filterObj.searchType || '수주건명',
            searchValue: filterObj.searchValue || '',
            startDate: filterObj.startDate || today,
            endDate: filterObj.endDate || today,
            // 🚩 이 부분 추가! (안 넘어오면 기본값은 true로 세팅해서 무조건 제외시킴)
            excludeNormal: filterObj.excludeNormal !== undefined ? filterObj.excludeNormal : true
        });
        setCurrentPage('accident_list');
    };

    const fetchIssues = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await window.supabase.from('logistics_issues').select('*').order('id', { ascending: false });
            if (error) throw error;
            setIssues(data || []);
        } catch (error) {
            console.error('Supabase fetch exception:', error.message || error);
            setIssues([]);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchProfile = async () => {
        if (!session) return;
        try {
            const { data, error } = await window.supabase.from('profiles').select('*').eq('id', session.user.id).single();
            if (data) {
                setUserProfile(data);
                if (data.role === '사용자' && currentPage === 'user_management') setCurrentPage('dashboard');
            }
        } catch (err) {
            console.error('프로필 갱신 실패:', err);
        }
    };

    // 3. 부수 효과 (인증, 알림 등)
    useEffect(() => {
        window.supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session); setAuthLoading(false);
        });
        const { data: { subscription } } = window.supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session); setAuthLoading(false);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (session) { fetchIssues(); fetchProfile(); }
    }, [session]);

    useEffect(() => {
        if (session) localStorage.setItem('letus_noti_' + session.user.id, JSON.stringify(notifications));
    }, [notifications, session]);

    useEffect(() => {
        if (session) {
            const saved = localStorage.getItem('letus_noti_' + session.user.id);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const now = new Date().getTime();
                    setNotifications(parsed.filter(n => !(n.read && n.read_at && (now - n.read_at > 24 * 60 * 60 * 1000))));
                } catch (e) { }
            }
        }
    }, [session]);

    useEffect(() => {
        if (!session || !userProfile) return;

        if (Notification.permission === 'default' && !sessionStorage.getItem('notiAsked')) {
            sessionStorage.setItem('notiAsked', 'true');
            Notification.requestPermission();
        }

        const channel = window.supabase.channel('logistics_issue_notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logistics_issues' }, (payload) => handleIssueChange(payload.new, '신규 입고'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'logistics_issues' }, (payload) => handleIssueChange(payload.new, '상태 변경'))
            .subscribe();

        const handleIssueChange = (newData, type) => {
            const userBrands = userProfile?.managed_brands ? userProfile.managed_brands.split(',').map(s => s.trim()) : [];
            const userVendors = userProfile?.managed_vendors ? userProfile.managed_vendors.split(',').map(s => s.trim()) : [];

            let shouldAlert = false;
            let message = '';
            const currentStatus = newData.status || '조치대기';

            if (currentStatus === '조치대기' && userProfile?.role?.includes('관리자') && (userBrands.includes('전체') || userBrands.includes(newData.brand))) {
                shouldAlert = true; message = `[신규] ${newData.brand} 브랜드의 새로운 이슈가 접수되었습니다. (${newData.reception_no})`;
            } else if (currentStatus === '처리 중' && userVendors.includes(newData.vendor)) {
                shouldAlert = true; message = `[이관] 관리 중인 ${newData.vendor} 업체로 이슈가 이관되었습니다. (${newData.reception_no})`;
            } else if (currentStatus === '조치완료' && userProfile?.role?.includes('관리자') && (userBrands.includes('전체') || userBrands.includes(newData.brand))) {
                shouldAlert = true; message = `[조치완료] ${newData.brand} 브랜드의 이슈 조치가 완료되었습니다. (${newData.reception_no})`;
            }

            if (shouldAlert) {
                const nowTime = new Date().getTime();
                if (window.lastAlertMsg === message && nowTime - (window.lastAlertTime || 0) < 2000) return;
                window.lastAlertMsg = message;
                window.lastAlertTime = nowTime;

                const newNoti = {
                    id: newData.id + '_' + nowTime, title: type, message: message,
                    date: new Date(nowTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    read: false, read_at: null, filterObj: { brand: newData.brand || '전체', status: newData.status || '전체' }
                };

                setNotifications(prev => [newNoti, ...prev].slice(0, 10));

                if (Notification.permission === 'granted') {
                    new Notification(`LETUS LOGIS - ${type}`, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' });
                }
                fetchIssues();
            }
        };

        return () => { window.supabase.removeChannel(channel); };
    }, [session, userProfile]);

    // 4. 컴포넌트로 전달할 데이터 묶음
    return {
        session, authLoading, currentPage, setCurrentPage, issues, isLoading, userProfile,
        selfEditTarget, setSelfEditTarget, notifications, isNotiOpen, setIsNotiOpen,
        isSidebarOpen, setIsSidebarOpen, accidentDrillDownFilters, favorites, toggleFavorite,
        savedListFilters, setSavedListFilters, handleNotiClick, handleMarkAllAsRead,
        handleLogout, handleDrillDown, handleAccidentDrillDown, fetchIssues, fetchProfile
    };
};

export { useAppLogic };
