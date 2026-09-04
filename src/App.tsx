import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth-store';
import { Sun } from 'lucide-react';

// Components
import { AuthGuard } from './components/AuthGuard';
import { AppLayout } from './components/AppLayout';
import { CryptoProvider } from './contexts/CryptoContext';
import { EncryptionUnlockModal } from './components/EncryptionUnlockModal';
import { SecurityAnnouncementModal } from './components/SecurityAnnouncementModal';

// Lazy-loaded pages for minimal initial bundle size & ultra-fast loading (§1)
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const PlannerPage = lazy(() => import('./pages/PlannerPage').then(m => ({ default: m.PlannerPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const InsightsPage = lazy(() => import('./pages/InsightsPage').then(m => ({ default: m.InsightsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const SecurityPage = lazy(() => import('./pages/SecurityPage').then(m => ({ default: m.SecurityPage })));
const PersonalisationPage = lazy(() => import('./pages/PersonalisationPage').then(m => ({ default: m.PersonalisationPage })));

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center p-8">
    <div className="flex flex-col items-center gap-3 fade-in select-none">
      <Sun size={36} className="text-lavender animate-spin" style={{ animationDuration: '3s' }} />
      <span className="text-xs font-semibold text-text-muted dark:text-dark-text-muted">
        Loading space…
      </span>
    </div>
  </div>
);

const App: React.FC = () => {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <CryptoProvider>
        <EncryptionUnlockModal />
        <SecurityAnnouncementModal />
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />

            {/* Protected routes */}
            <Route path="/onboarding" element={
              <AuthGuard><OnboardingPage /></AuthGuard>
            } />

            <Route path="/app" element={
              <AuthGuard><AppLayout /></AuthGuard>
            }>
              <Route index element={<PlannerPage />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="insights" element={<InsightsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="security" element={<SecurityPage />} />
              <Route path="personalisation" element={<PersonalisationPage />} />
            </Route>

            {/* Default redirect */}
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </Suspense>
      </CryptoProvider>
    </BrowserRouter>
  );
};

export default App;
