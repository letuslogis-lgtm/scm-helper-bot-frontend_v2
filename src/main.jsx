import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './index.css';
import { supabase } from './supabaseClient.js';

import { MainLayout } from './MainLayout.jsx';
import { LoginView } from './LoginView.jsx';
import { MyDashboard } from './MyHome.jsx';
import { Dashboard } from './LogisticsDashboard.jsx';
import { IssueList } from './IssueList.jsx';
import { WorkerManagement } from './WorkerManagement.jsx';
import { AttendanceManagement } from './attendance/AttendanceManagement.jsx';
import { AccidentDashboard, AccidentList } from './AccidentManagement.jsx';
import { AccidentAnalyticsReport } from './AccidentAnalyticsReport.jsx';
import { ProductManager } from './ProductManager.jsx';
import { UserManagement } from './UserManagement.jsx';
import { SupportCenter } from './SupportCenter.jsx';
import { NoticeBoard } from './NoticeBoard.jsx';
import { DatabaseDictionary } from './DatabaseDictionary.jsx';
import { UserEditModal } from './SharedUI.jsx';
import { TeamCalendar } from './TeamCalendar.jsx';
import { RpaManagement } from './RpaManagement.jsx';
import { LoadingMap } from './LoadingMap.jsx';
import { AiInsightLab } from './AiInsightLab.jsx';
import { ReturnsManagement } from './ReturnsManagement.jsx';
import { OutgoingNotes } from './OutgoingNotes.jsx';
import { WmsShortageList } from './WmsShortageList.jsx';
import { LogisticsClosing } from './LogisticsClosing.jsx';
import { WmsStockDashboard } from './WmsStockDashboard.jsx';
import { ErpInboundConfig } from './ErpInboundConfig.jsx';
import { InboundClosing } from './inbound/InboundClosing.jsx';
import { MobileIssueRegister } from './MobileIssueRegister.jsx';
import { MobileForkliftDailyCheck } from './MobileForkliftDailyCheck.jsx';
import { MobileForkliftIssueRegister } from './MobileForkliftIssueRegister.jsx';
import { MobileReturnsRegister } from './MobileReturnsRegister.jsx';
import { MobilePreDeliveryManage } from './MobilePreDeliveryManage.jsx';
import { MobileReturnsList } from './MobileReturnsList.jsx';
import { MobileMenuScreen } from './MobileMenuScreen.jsx';
import { MobileMyIssues } from './MobileMyIssues.jsx';
import { MobileNotice } from './MobileNotice.jsx';
import { MobileLoginView } from './MobileLoginView.jsx';
import { MobileAdminMenu } from './MobileAdminMenu.jsx';
import { MobileAdminIssueList } from './MobileAdminIssueList.jsx';
import { MobileBarcodeTester } from './MobileBarcodeTester.jsx';
import { MobileSuggestion } from './MobileSuggestion.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ForkliftDashboard } from './forklift/ForkliftDashboard.jsx';
import { ForkliftManagement } from './forklift/ForkliftManagement.jsx';
import { ForkliftDailyCheck } from './forklift/ForkliftDailyCheck.jsx';
import { ForkliftRepair } from './forklift/ForkliftRepair.jsx';
import { ForkliftIssue } from './forklift/ForkliftIssue.jsx';
import { MenuPermissionConfig } from './MenuPermissionConfig.jsx';

import { useAuth } from './hooks/useAuth.jsx';
import { useIssues } from './hooks/useIssues.jsx';
import { useNotifications } from './hooks/useNotifications.jsx';

const AppContent = () => {
    const authLogic = useAuth();
    const issueLogic = useIssues(authLogic.session, authLogic.userProfile);
    const notiLogic = useNotifications(authLogic.session, authLogic.userProfile, issueLogic.fetchIssues);

    const navigate = useNavigate();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

    if (authLogic.authLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-letusBlue">세션 확인 중...</div>;
    if (!authLogic.session) return <LoginView />;

    const logic = { ...authLogic, ...issueLogic, ...notiLogic, isSidebarOpen, setIsSidebarOpen };

    const handleDrillDown = (filterObj) => {
        logic.setSavedListFilters(prev => ({
            ...prev, brand: filterObj.brand || '전체', status: filterObj.status || '전체',
            startDate: filterObj.startDate || prev.startDate, endDate: filterObj.endDate || prev.endDate
        }));
        navigate('/list');
    };

    const handleAccidentDrillDown = (filterObj) => {
        const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
        logic.setAccidentDrillDownFilters({
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
            excludeNormal: filterObj.excludeNormal !== undefined ? filterObj.excludeNormal : true
        });
        navigate('/accident_list');
    };

    const handleNotiClick = (notiId, filterObj) => {
        logic.setNotifications(prev => prev.map(n => n.id === notiId ? { ...n, read: true, read_at: new Date().getTime() } : n));
        
        if (filterObj && filterObj.type === 'calendar') {
            navigate('/team_calendar');
        } else if (filterObj && filterObj.type === 'notice') {
            navigate('/notice');
        } else if (filterObj && filterObj.type === 'returns') {
            navigate('/returns_management');
        } else if (filterObj) {
            handleDrillDown(filterObj);
        }
        
        logic.setIsNotiOpen(false);
    };

    // MainLayout에 필요한 라우팅 기반 props
    const currentPage = location.pathname.substring(1) || 'home';
    const setCurrentPage = (pageId) => navigate('/' + pageId);

    return (
        <MainLayout 
            {...logic} 
            currentPage={currentPage} 
            setCurrentPage={setCurrentPage}
            handleNotiClick={handleNotiClick}
        >
            <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<MyDashboard userProfile={logic.userProfile} setPage={setCurrentPage} favorites={logic.favorites} />} />
                <Route path="/dashboard" element={<Dashboard onNavigateToList={() => navigate('/list')} onDrillDown={handleDrillDown} issues={logic.issues} isLoading={logic.isLoading} onReload={logic.fetchIssues} />} />
                <Route path="/team_calendar" element={<TeamCalendar userProfile={logic.userProfile} />} />
                <Route path="/list" element={<IssueList userProfile={logic.userProfile} issues={logic.issues} isLoading={logic.isLoading} onReload={logic.fetchIssues} savedFilters={logic.savedListFilters} setSavedFilters={logic.setSavedListFilters} />} />
                <Route path="/worker_management" element={<WorkerManagement />} />
                <Route path="/attendance" element={<AttendanceManagement />} />
                <Route path="/accident_dashboard" element={<AccidentDashboard userProfile={logic.userProfile} onDrillDown={handleAccidentDrillDown} />} />
                <Route path="/accident_list" element={<AccidentList userProfile={logic.userProfile} initialFilter={logic.accidentDrillDownFilters} />} />
                <Route path="/accident_report" element={<AccidentAnalyticsReport userProfile={logic.userProfile} onDrillDown={handleAccidentDrillDown} />} />
                <Route path="/product_manager" element={<ProductManager />} />
                <Route path="/user_management" element={<UserManagement />} />
                <Route path="/support" element={<SupportCenter userProfile={logic.userProfile} />} />
                <Route path="/notice" element={<NoticeBoard userProfile={logic.userProfile} />} />
                <Route path="/db_map" element={<DatabaseDictionary />} />
                <Route path="/rpa_management" element={<RpaManagement />} />
                <Route path="/loading_map" element={<LoadingMap />} />
                <Route path="/ai_lab" element={<AiInsightLab />} />
                <Route path="/returns_management" element={<ReturnsManagement userProfile={logic.userProfile} />} />
                <Route path="/outgoing_notes"     element={<OutgoingNotes    userProfile={logic.userProfile} />} />
                <Route path="/logistics_closing" element={<LogisticsClosing />} />
                <Route path="/inbound_closing" element={<InboundClosing />} />
                <Route path="/wms_stock" element={<WmsStockDashboard userProfile={logic.userProfile} />} />
                <Route path="/wms_shortage" element={<WmsShortageList userProfile={logic.userProfile} />} />
                <Route path="/erp_inbound_config" element={<ErpInboundConfig />} />
                <Route path="/menu_permissions"  element={<MenuPermissionConfig userProfile={logic.userProfile} />} />
                <Route path="/forklift_dashboard" element={<ForkliftDashboard userProfile={logic.userProfile} />} />
                <Route path="/forklift_list"      element={<ForkliftManagement userProfile={logic.userProfile} />} />
                <Route path="/forklift_check"     element={<ForkliftDailyCheck userProfile={logic.userProfile} />} />
                <Route path="/forklift_repair"    element={<ForkliftRepair userProfile={logic.userProfile} />} />
                <Route path="/forklift_issue"     element={<ForkliftIssue userProfile={logic.userProfile} />} />
                <Route path="*" element={<div className="p-8 text-center text-gray-500 font-bold">페이지를 찾을 수 없습니다 (404)</div>} />
            </Routes>

            {logic.selfEditTarget && (
                <UserEditModal user={logic.selfEditTarget} onClose={() => logic.setSelfEditTarget(null)} onReload={logic.fetchProfile} isProfileMode={true} />
            )}
        </MainLayout>
    );
};

// 메인 메뉴 래퍼: adminMode 상태를 이 컴포넌트 안에서 관리해 React Router 캐시 문제 우회
const MobileMenuHome = ({ userProfile, handleLogout, adminPendingCount, completedNotiCount, returnsNotiCount, isAdmin }) => {
    const [adminMode, setAdminMode] = React.useState(true);
    const toggleMode = React.useCallback(() => setAdminMode(prev => !prev), []);

    if (isAdmin && adminMode) {
        return (
            <MobileAdminMenu
                userProfile={userProfile}
                handleLogout={handleLogout}
                pendingCount={adminPendingCount}
                onLogoClick={toggleMode}
            />
        );
    }
    return (
        <MobileMenuScreen
            userProfile={userProfile}
            handleLogout={handleLogout}
            completedNotiCount={completedNotiCount}
            returnsNotiCount={returnsNotiCount}
            onLogoClick={isAdmin ? toggleMode : undefined}
        />
    );
};

const ProtectedMobileRoute = () => {
    const { session, authLoading, userProfile, handleLogout } = useAuth();
    const [completedNotiCount, setCompletedNotiCount] = React.useState(0);
    const [returnsNotiCount, setReturnsNotiCount] = React.useState(0);
    const [adminPendingCount, setAdminPendingCount] = React.useState(0);

    const isAdmin = userProfile?.role?.includes('관리자');

    // 관리자: 미처리(조치대기) 건수 실시간 추적
    React.useEffect(() => {
        if (!isAdmin || !userProfile?.id) return;

        // 초기 건수 조회
        supabase.from('logistics_issues')
            .select('id', { count: 'exact', head: true })
            .eq('status', '조치대기')
            .then(({ count }) => setAdminPendingCount(count || 0));

        // 실시간 구독
        const channel = supabase.channel(`admin_pending_count_${userProfile.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'logistics_issues' },
                (payload) => {
                    const newStatus = payload.new?.status;
                    const oldStatus = payload.old?.status;
                    if (payload.eventType === 'INSERT' && newStatus === '조치대기') {
                        setAdminPendingCount(prev => prev + 1);
                    } else if (payload.eventType === 'UPDATE') {
                        if (oldStatus === '조치대기' && newStatus !== '조치대기') {
                            setAdminPendingCount(prev => Math.max(0, prev - 1));
                        } else if (oldStatus !== '조치대기' && newStatus === '조치대기') {
                            setAdminPendingCount(prev => prev + 1);
                        }
                    }
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [isAdmin, userProfile?.id]);

    React.useEffect(() => {
        if (!userProfile?.name) return;

        const channel = supabase.channel(`mobile_issue_updates_${userProfile.name}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'logistics_issues',
                filter: `reporter=eq.${userProfile.name}`,
            }, (payload) => {
                if (payload.new?.status === '조치완료' && payload.old?.status !== '조치완료') {
                    setCompletedNotiCount(prev => prev + 1);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userProfile?.name]);

    React.useEffect(() => {
        if (!userProfile?.name) return;

        const channel = supabase.channel(`mobile_returns_updates_${userProfile.name}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'logistics_returns',
                filter: `writer=eq.${userProfile.name}`,
            }, (payload) => {
                const isNewlyRecovered = payload.new?.is_recovered && !payload.old?.is_recovered;
                const isNewlyCompleted = payload.new?.is_completed && !payload.old?.is_completed;
                if (isNewlyRecovered || isNewlyCompleted) {
                    setReturnsNotiCount(prev => prev + 1);
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [userProfile?.name]);

    if (authLoading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center font-bold text-blue-300">세션 확인 중...</div>;
    if (!session) return <MobileLoginView />;
    return (
        <Routes>
            {/* ── 메인 메뉴: MobileMenuHome이 adminMode 상태를 직접 관리 ── */}
            <Route index element={
                <MobileMenuHome
                    userProfile={userProfile}
                    handleLogout={handleLogout}
                    adminPendingCount={adminPendingCount}
                    completedNotiCount={completedNotiCount}
                    returnsNotiCount={returnsNotiCount}
                    isAdmin={isAdmin}
                />
            } />
            {/* ── 관리자 전용 라우트 ── */}
            <Route path="admin/issues" element={<MobileAdminIssueList userProfile={userProfile} />} />
            <Route path="admin/barcode-tester" element={<MobileBarcodeTester />} />
            <Route path="admin/forklift-check" element={<MobileForkliftDailyCheck userProfile={userProfile} />} />
            <Route path="admin/forklift-issue" element={<MobileForkliftIssueRegister userProfile={userProfile} />} />
            {/* ── 작업자 라우트 (공지는 관리자도 접근 가능) ── */}
            <Route path="register" element={<MobileIssueRegister />} />
            <Route path="returns" element={<MobileReturnsRegister userProfile={userProfile} />} />
            <Route path="pre-delivery" element={<MobilePreDeliveryManage userProfile={userProfile} />} />
            <Route path="returns-list" element={<MobileReturnsList userProfile={userProfile} onNotificationsRead={() => setReturnsNotiCount(0)} />} />
            <Route path="my-issues" element={
                <MobileMyIssues userProfile={userProfile} onNotificationsRead={() => setCompletedNotiCount(0)} />
            } />
            <Route path="notice" element={<MobileNotice />} />
            <Route path="suggestion" element={<MobileSuggestion userProfile={userProfile} />} />
            <Route path="*" element={<Navigate to="/mobile" replace />} />
        </Routes>
    );
};

const App = () => {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    {/* 모바일 전용 경로 — 인증 후 독립 렌더링 */}
                    <Route path="/mobile/*" element={<ProtectedMobileRoute />} />
                    {/* 기존 데스크톱 앱 */}
                    <Route path="/*" element={<AppContent />} />
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
