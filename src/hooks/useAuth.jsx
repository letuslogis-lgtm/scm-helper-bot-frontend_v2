import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

export const useAuth = () => {
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [userProfile, setUserProfile] = useState(null);
    const [selfEditTarget, setSelfEditTarget] = useState(null);
    const [favorites, setFavorites] = useState(() => {
        try {
            const savedFavs = localStorage.getItem('letus_favorites');
            const parsed = savedFavs ? JSON.parse(savedFavs) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    const toggleFavorite = (pageId) => {
        setFavorites(prev => {
            const newFavs = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId];
            localStorage.setItem('letus_favorites', JSON.stringify(newFavs));
            return newFavs;
        });
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUserProfile(null);
        setSession(null);
    };

    const fetchProfile = async () => {
        if (!session) return;
        try {
            const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
            if (error) throw error;
            if (data) setUserProfile(data);
        } catch (err) {
            console.error('프로필 갱신 실패:', err);
        }
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
