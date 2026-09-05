import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import TransactionsPage from './pages/TransactionsPage';
import ChargebacksPage from './pages/ChargebacksPage';
import AgentTracesPage from './pages/AgentTracesPage';
import AnalyticsPage from './pages/AnalyticsPage';

function AppContent() {
  const { isAuthenticated, loading, login, fillDemo } = useAuth();
  const [unauthView, setUnauthView] = useState('landing'); // 'landing', 'login', 'signup'
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'transactions', 'chargebacks', 'traces', 'analytics'
  const [selectedChargebackId, setSelectedChargebackId] = useState(null);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-sans)',
      }}>
        Initializing RiskyPlay Defense Platform...
      </div>
    );
  }

  // Unauthenticated Flow
  if (!isAuthenticated) {
    if (unauthView === 'login') {
      return <LoginPage onSwitchToSignup={() => setUnauthView('signup')} />;
    }
    if (unauthView === 'signup') {
      return <SignupPage onSwitchToLogin={() => setUnauthView('login')} />;
    }
    return (
      <LandingPage
        onEnterDemo={async () => {
          const demo = fillDemo();
          try {
            await login(demo.email, demo.password);
          } catch (err) {
            setUnauthView('login');
          }
        }}
        onOpenLogin={() => setUnauthView('login')}
        onOpenSignup={() => setUnauthView('signup')}
      />
    );
  }

  // Authenticated Merchant Workspace
  return (
    <div className="app-layout">
      <div className="main-content">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div style={{ display: 'flex', flex: 1 }}>
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {activeTab === 'dashboard' && (
              <DashboardPage
                setActiveTab={setActiveTab}
                setSelectedChargebackId={setSelectedChargebackId}
              />
            )}
            {activeTab === 'transactions' && <TransactionsPage />}
            {activeTab === 'chargebacks' && (
              <ChargebacksPage
                selectedChargebackId={selectedChargebackId}
                setSelectedChargebackId={setSelectedChargebackId}
              />
            )}
            {activeTab === 'traces' && <AgentTracesPage />}
            {activeTab === 'analytics' && <AnalyticsPage />}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
