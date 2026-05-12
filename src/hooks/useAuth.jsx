import { useState, useEffect } from 'react';

export const useAuth = () => {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [selfEditTarget, setSelfEditTarget] = useState(null);
    const [favorites, setFavorites] = useState(() => {
        const savedFavs = localStorage.getItem('letus_favorites');
        return savedFavs ? JSON.parse(savedFavs) : [];
    });

    const toggleFavorite = (pageId) => {
        setFavorites(prev => {
            const newFavs = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId];
            localStorage.setItem('letus_favorites', JSON.stringify(newFavs));
            return newFavs;
        });
    };

    const handleLogout = async () => {
        await window.supabase.auth.signOut();
        setUserProfile(null);
        setSession(null);
    };

    const fetchProfile = async () => {
        if (!session) return;
        try {
            const { data, error } = await window.supabase.from('profiles').select('*').eq('id', session.user.id).single();
            if (data) {
                setUserProfile(data);
            }
        } catch (err) {
            console.error('프로필 갱신 실패:', err);
        }
    };

    useEffect(() => {
        window.supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });
        const { data: { subscription } } = window.supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setAuthLoading(false);
        });
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (session) {
            fetchProfile();
        }
    }, [session]);

    return {
        session,
        authLoading,
        userProfile,
        setUserProfile,
        selfEditTarget,
        setSelfEditTarget,
        favorites,
        toggleFavorite,
        handleLogout,
        fetchProfile
    };
};
