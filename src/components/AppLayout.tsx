import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Sun, Calendar, BarChart3, Settings, LogOut, Sparkles } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { useUserSettings } from '../hooks/useUserSettings';
import { useNotificationReminders } from '../hooks/useNotificationReminders';
import { Navigate } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/app', label: 'Today', icon: Sun, end: true },
  { to: '/app/history', label: 'History', icon: Calendar, end: false },
  { to: '/app/insights', label: 'Insights', icon: Sparkles, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
];

export const AppLayout: React.FC = () => {
  const signOut = useAuthStore((s) => s.signOut);
  const navigate = useNavigate();
  const { settings, loading } = useUserSettings();

  // Initialize browser notification reminders
  useNotificationReminders();

  // If loaded and not onboarded, redirect to onboarding
  if (!loading && settings && !settings.onboarding_complete) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!loading && !settings) {
    return <Navigate to="/onboarding" replace />;
  }

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-cream dark:bg-dark-bg transition-colors duration-300">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 p-4 border-r border-border dark:border-dark-border bg-surface/50 dark:bg-dark-surface/50">
        {/* Logo */}
        <div className="flex items-center gap-2 px-3 mb-8">
          <Sun size={24} className="text-lavender" />
          <span className="font-extrabold text-lg text-text-primary dark:text-dark-text">
            Daylight
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button onClick={handleLogout} className="nav-link text-left mt-auto hover:text-red-500">
          <LogOut size={20} />
          Log out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface dark:bg-dark-surface border-t border-border dark:border-dark-border flex justify-around py-2 px-1 z-50">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                isActive
                  ? 'text-lavender-dark dark:text-lavender'
                  : 'text-text-muted dark:text-dark-text-muted'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
