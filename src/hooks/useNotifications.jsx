import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient.js';

export const useNotifications = (session, userProfile, fetchIssues) => {
    const [notifications, setNotifications] = useState([]);
    const [isNotiOpen, setIsNotiOpen] = useState(false);

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
        if (session) {
            localStorage.setItem('letus_noti_' + session.user.id, JSON.stringify(notifications));
        }
    }, [notifications, session]);

    useEffect(() => {
        if (!session || !userProfile) return;

        if (Notification.permission === 'default' && !sessionStorage.getItem('notiAsked')) {
            sessionStorage.setItem('notiAsked', 'true');
            Notification.requestPermission();
        }

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
                fetchIssues && fetchIssues();
            }
        };

        const channel = supabase.channel('logistics_issue_notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logistics_issues' }, (payload) => handleIssueChange(payload.new, '신규 입고'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'logistics_issues' }, (payload) => handleIssueChange(payload.new, '상태 변경'))
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [session, userProfile, fetchIssues]);

    // 🌟 캘린더 30분 전 알림 로직
    useEffect(() => {
        if (!session || !userProfile) return;

        let todayEvents = [];
        const notifiedEventIds = new Set(JSON.parse(localStorage.getItem(`letus_cal_noti_${session.user.id}`) || '[]'));

        const fetchTodayEvents = async () => {
            const today = new Date();
            const pad = n => String(n).padStart(2, '0');
            const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

            const { data, error } = await supabase
                .from('calendar_events')
                .select('id, title, start_time')
                .eq('start_date', todayStr)
                .ilike('collaborators', `%${userProfile.name}%`);

            if (!error && data) {
                todayEvents = data;
                console.log("[알림 시스템] 오늘 감지된 내 일정 수:", data.length, data);
            } else if (error) {
                console.error("[알림 시스템] 일정 조회 에러:", error);
            }
        };

        fetchTodayEvents();

        // 캘린더 일정 변경 감지 (실시간 보조)
        const calendarChannel = supabase.channel('calendar_notifications_channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
                fetchTodayEvents();
            })
            .subscribe();

        // 1분마다 검사 (강제 폴링 포함)
        const intervalId = setInterval(async () => {
            await fetchTodayEvents(); // 실시간 구독이 안 되어 있을 경우를 대비하여 매 1분마다 무조건 최신화
            
            if (todayEvents.length === 0) return;

            const now = new Date();
            const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

            todayEvents.forEach(ev => {
                if (!ev.start_time || notifiedEventIds.has(ev.id)) return;

                const [startH, startM] = ev.start_time.split(':').map(Number);
                const eventTotalMinutes = startH * 60 + startM;

                const diff = eventTotalMinutes - currentTotalMinutes;

                // 🌟 브라우저 비활성 상태(탭 백그라운드)나 PC 절전모드 시 타이머가 밀릴 수 있으므로
                // 정확히 30, 29분이 아니더라도 '30분 이하로 남았고 아직 알림을 안 보낸 경우' 무조건 발송
                if (diff <= 30 && diff > 0) {
                    console.log(`[알림 시스템] 알림 발송 조건 충족! 일정: ${ev.title}, 남은시간: ${diff}분`);
                    notifiedEventIds.add(ev.id);
                    localStorage.setItem(`letus_cal_noti_${session.user.id}`, JSON.stringify([...notifiedEventIds]));

                    const type = '일정 안내';
                    const message = `[일정 안내] 잠시 후 '${ev.title}' 일정이 시작됩니다. (${ev.start_time})`;
                    const nowTime = now.getTime();

                    const newNoti = {
                        id: 'cal_' + ev.id + '_' + nowTime, title: type, message: message,
                        date: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        read: false, read_at: null, filterObj: { type: 'calendar' }
                    };

                    setNotifications(prev => {
                        console.log("[알림 시스템] 헤더 알림 상태 업데이트 실행");
                        return [newNoti, ...prev].slice(0, 10);
                    });

                    if (Notification.permission === 'granted') {
                        new Notification(`LETUS LOGIS - ${type}`, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/3652/3652191.png' });
                    }
                } else {
                    console.log(`[알림 시스템] ${ev.title} - 남은 시간: ${diff}분 (알림 대기 중 또는 이미 지남)`);
                }
            });
        }, 60 * 1000);

        return () => {
            clearInterval(intervalId);
            supabase.removeChannel(calendarChannel);
        };
    }, [session, userProfile]);

    // 🌟 공지사항 실시간 타겟팅 알림 로직
    useEffect(() => {
        if (!session || !userProfile) return;

        const handleNoticeChange = (newNotice) => {
            // 본인이 작성한 공지사항은 알림 제외
            if (newNotice.creator_name === userProfile.name) return;

            const tags = newNotice.tags ? newNotice.tags.split(',').map(s => s.trim()).filter(Boolean) : [];
            const myTeam = userProfile.team || '';

            // 알림 발송 조건: 태그가 지정되지 않았거나(전체 공지), 내 부서가 태그에 포함된 경우
            const shouldAlert = tags.length === 0 || tags.includes(myTeam);

            if (shouldAlert) {
                const nowTime = new Date().getTime();
                const type = newNotice.is_important ? '🚨 긴급 공지' : '새 공지사항';
                const message = `[공지] ${newNotice.title}`;

                // 단시간 내 중복 이벤트 방지
                if (window.lastNoticeAlertId === newNotice.id) return;
                window.lastNoticeAlertId = newNotice.id;

                const newNoti = {
                    id: 'notice_' + newNotice.id + '_' + nowTime, 
                    title: type, 
                    message: message,
                    date: new Date(nowTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    read: false, 
                    read_at: null, 
                    filterObj: { type: 'notice' }
                };

                setNotifications(prev => [newNoti, ...prev].slice(0, 10));

                if (Notification.permission === 'granted') {
                    new Notification(`LETUS LOGIS - ${type}`, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' });
                }
            }
        };

        const noticeChannel = supabase.channel('notice_notifications_channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notices' }, (payload) => {
                handleNoticeChange(payload.new);
            })
            .subscribe();

        return () => { supabase.removeChannel(noticeChannel); };
    }, [session, userProfile]);

    // logistics_returns 알림 (관리자 전용)
    useEffect(() => {
        if (!session || !userProfile) return;
        if (!userProfile?.role?.includes('관리자')) return;

        const handleReturnsChange = (newData, oldData, event) => {
            let shouldAlert = false;
            let type = '';
            let message = '';

            if (event === 'INSERT') {
                const typeLabel = newData.type === '선출고' ? '선출고' : '회수품';
                type = `신규 ${typeLabel} 접수`;
                message = `[${typeLabel}] ${newData.incident_center || '-'} · ${newData.item_code || '-'}${newData.quantity ? ' ' + newData.quantity + 'EA' : ''} (등록: ${newData.writer || '-'})`;
                shouldAlert = true;
            } else if (event === 'UPDATE') {
                if (newData.type === '선출고' && newData.is_recovered && !oldData?.is_recovered) {
                    type = '선출고 회수 완료';
                    message = `[선출고 회수] ${newData.incident_center || '-'} · ${newData.item_code || '-'} 회수 처리 완료`;
                    shouldAlert = true;
                } else if (newData.type !== '선출고' && newData.is_completed && !oldData?.is_completed) {
                    type = '회수품 완결 처리';
                    message = `[회수품 완결] ${newData.incident_center || '-'} · ${newData.item_code || '-'} 완결 처리됨`;
                    shouldAlert = true;
                }
            }

            if (shouldAlert) {
                const nowTime = new Date().getTime();
                const dupKey = `returns_${newData.id}_${event}`;
                if (window.lastReturnsAlertKey === dupKey && nowTime - (window.lastReturnsAlertTime || 0) < 2000) return;
                window.lastReturnsAlertKey = dupKey;
                window.lastReturnsAlertTime = nowTime;

                const newNoti = {
                    id: 'returns_' + newData.id + '_' + nowTime,
                    title: type,
                    message: message,
                    date: new Date(nowTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    read: false,
                    read_at: null,
                    filterObj: { type: 'returns' },
                };

                setNotifications(prev => [newNoti, ...prev].slice(0, 10));

                if (Notification.permission === 'granted') {
                    new Notification(`LETUS LOGIS - ${type}`, { body: message, icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png' });
                }
            }
        };

        const returnsChannel = supabase.channel('logistics_returns_notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'logistics_returns' }, (payload) => handleReturnsChange(payload.new, null, 'INSERT'))
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'logistics_returns' }, (payload) => handleReturnsChange(payload.new, payload.old, 'UPDATE'))
            .subscribe();

        return () => { supabase.removeChannel(returnsChannel); };
    }, [session, userProfile]);

    const handleMarkAllAsRead = () => {
        const now = new Date().getTime();
        setNotifications(prev => prev.map(n => ({ ...n, read: true, read_at: now })));
    };

    return {
        notifications,
        setNotifications,
        isNotiOpen,
        setIsNotiOpen,
        handleMarkAllAsRead
    };
};
