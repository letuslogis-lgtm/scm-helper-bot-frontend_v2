import React from 'react';
import ReactDOM from 'react-dom/client';
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
import { useAppLogic } from './useAppLogic.jsx';
import { DatabaseDictionary } from './DatabaseDictionary.jsx';
import { UserEditModal } from './SharedUI.jsx';
import { TeamCalendar } from './TeamCalendar.jsx';

const App = () => {
    // 💡 마법의 훅으로 수백 줄의 로직을 대체
    const logic = useAppLogic();

    if (logic.authLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-letusBlue">세션 확인 중...</div>;
    if (!logic.session) return <LoginView />;

    return (
        <MainLayout {...logic}>
            {logic.currentPage === 'home' && <MyDashboard userProfile={logic.userProfile} setPage={logic.setCurrentPage} favorites={logic.favorites} />}
            {logic.currentPage === 'dashboard' && <Dashboard onNavigateToList={() => logic.setCurrentPage('list')} onDrillDown={logic.handleDrillDown} issues={logic.issues} isLoading={logic.isLoading} onReload={logic.fetchIssues} />}
            {logic.currentPage === 'team_calendar' && <TeamCalendar userProfile={logic.userProfile} />}
            {logic.currentPage === 'list' && <IssueList userProfile={logic.userProfile} issues={logic.issues} isLoading={logic.isLoading} onReload={logic.fetchIssues} savedFilters={logic.savedListFilters} setSavedFilters={logic.setSavedListFilters} />}
            {logic.currentPage === 'worker_management' && <WorkerManagement />}
            {logic.currentPage === 'attendance' && <AttendanceManagement />}
            {logic.currentPage === 'accident_dashboard' && <AccidentDashboard userProfile={logic.userProfile} onDrillDown={logic.handleAccidentDrillDown} />}
            {logic.currentPage === 'accident_list' && <AccidentList userProfile={logic.userProfile} initialFilter={logic.accidentDrillDownFilters} />}
            {logic.currentPage === 'accident_report' && <AccidentAnalyticsReport userProfile={logic.userProfile} onDrillDown={logic.handleAccidentDrillDown} />}
            {logic.currentPage === 'product_manager' && <ProductManager />}
            {logic.currentPage === 'user_management' && <UserManagement />}
            {logic.currentPage === 'support' && <SupportCenter userProfile={logic.userProfile} />}
            {logic.currentPage === 'db_map' && <DatabaseDictionary />}

            {logic.selfEditTarget && (
                <UserEditModal user={logic.selfEditTarget} onClose={() => logic.setSelfEditTarget(null)} onReload={logic.fetchProfile} isProfileMode={true} />
            )}
        </MainLayout>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
