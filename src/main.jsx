import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './index.css';

import { MainLayout } from './MainLayout.jsx';
import { LoginView } from './LoginView.jsx';
import { MyDashboard } from './MyHome.jsx';
import { Dashboard } from './LogisticsDashboard.jsx';
import { IssueList } from './IssueList.jsx';
import { WorkerManagement } from './WorkerManagement.jsx';
import { AttendanceManagement } from './AttendanceManagement.jsx';
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
import { MobileIssueRegister } from './MobileIssueRegister.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';

import { useAuth } from './hooks/useAuth.jsx';
import { useIssues } from './hooks/useIssues.jsx';
import { useNotifications } from './hooks/useNotifications.jsx';

const AppContent = () => {
    const authLogic = useAuth();
    const issueLogic = useIssues(authLogic.session);
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
        const today = new Date().toISOString().split("T")[0];
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
                <Route path="*" element={<div className="p-8 text-center text-gray-500 font-bold">페이지를 찾을 수 없습니다 (404)</div>} />
            </Routes>

            {logic.selfEditTarget && (
                <UserEditModal user={logic.selfEditTarget} onClose={() => logic.setSelfEditTarget(null)} onReload={logic.fetchProfile} isProfileMode={true} />
            )}
        </MainLayout>
    );
};

const ProtectedMobileRoute = () => {
    const { session, authLoading } = useAuth();
    if (authLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-letusBlue">세션 확인 중...</div>;
    if (!session) return <LoginView />;
    return <MobileIssueRegister />;
};

const App = () => {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <Routes>
                    {/* 모바일 전용 경로 — 인증 후 독립 렌더링 */}
                    <Route path="/mobile" element={<ProtectedMobileRoute />} />
                    {/* 기존 데스크톱 앱 */}
                    <Route path="/*" element={<AppContent />} />
                </Routes>
            </BrowserRouter>
        </ErrorBoundary>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
