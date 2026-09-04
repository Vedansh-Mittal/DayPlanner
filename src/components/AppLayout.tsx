import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Sun, Calendar, BarChart3, Settings, LogOut, Sparkles, Shield, Compass } from 'lucide-react';
import { useAuthStore } from '../stores/auth-store';
import { useUserSettings } from '../hooks/useUserSettings';
import { Navigate } from 'react-router-dom';
import { PwaInstallBanner } from './PwaInstallBanner';

const NAV_ITEMS = [
  { to: '/app', label: 'Today', icon: Sun, end: true },
  { to: '/app/history', label: 'History', icon: Calendar, end: false },
  { to: '/app/insights', label: 'Insights', icon: Sparkles, end: false },
  { to: '/app/personalisation', label: 'Persona', icon: Compass, end: false },
  { to: '/app/security', label: 'Security', icon: Shield, end: false },
  { to: '/app/settings', label: 'Settings', icon: Settings, end: false },
];

const GENTLE_MESSAGES = [
  { text: "Take a deep breath. You are doing so much better than you give yourself credit for. 🌸", tag: "Mindful Reminder" },
  { text: "Remember: even on your busy days, resting is still progress. Go easy on yourself today. ✨", tag: "Friendly Reminder" },
  { text: "You don't have to carry it all today. Just take one little step at a time. 🐢", tag: "Warm Hug" },
  { text: "A beautiful day begins with a calm, peaceful mind. Let's create something serene today. 🌅", tag: "Mindful Thought" },
  { text: "Your value isn't measured by how much you do. You are enough just as you are. 💖", tag: "Self-Care" },
  { text: "Drink some water, relax your shoulders, and unclench your jaw. You've got this. 💧", tag: "Body Check-in" },
  { text: "May today bring you small pockets of unexpected joy and peaceful moments. ☕", tag: "Daily Wish" },
  { text: "Perfect is overrated. Done and kind to yourself is the goal. 🎨", tag: "Gentle Reminder" },
  { text: "Even the tallest trees started as tiny seeds. Growth takes time. 🌱", tag: "Nature's Wisdom" }
];

export const AppLayout: React.FC = () => {
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { settings, loading } = useUserSettings();



  const [showWelcome, setShowWelcome] = React.useState(() => {
    return !sessionStorage.getItem('dayplanner_welcome_shown');
  });

  const [currentMessage] = React.useState(() => {
    const idx = Math.floor(Math.random() * GENTLE_MESSAGES.length);
    return GENTLE_MESSAGES[idx];
  });

  const handleEnter = () => {
    sessionStorage.setItem('dayplanner_welcome_shown', 'true');
    setShowWelcome(false);
    window.dispatchEvent(new Event('dayplanner_welcome_dismissed'));
  };

  React.useEffect(() => {
    if (showWelcome) {
      const timer = setTimeout(() => {
        handleEnter();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showWelcome]);



  // Loading fallback while settings are being fetched from Supabase
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream dark:bg-dark-bg">
        <div className="flex flex-col items-center gap-3 fade-in select-none">
          <Sun size={36} className="text-lavender animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-xs font-semibold text-text-muted dark:text-dark-text-muted">
            Loading your space…
          </span>
        </div>
      </div>
    );
  }

  // If loaded and not onboarded, redirect to onboarding
  if (settings && !settings.onboarding_complete) {
    return <Navigate to="/onboarding" replace />;
  }
  if (!settings) {
    return <Navigate to="/onboarding" replace />;
  }

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  if (showWelcome) {
    const userName =
      settings?.display_name ||
      user?.user_metadata?.full_name ||
      (user?.email ? user.email.split('@')[0] : '');
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-cream dark:bg-dark-bg splash-bg select-none transition-all duration-700">
        {/* Floating gradient decorative orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-pink-soft/10 dark:bg-pink-soft/5 blur-[80px] floating-orb-1 pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-lavender/10 dark:bg-lavender/5 blur-[80px] floating-orb-2 pointer-events-none" />

        <div className="max-w-md w-full mx-4 text-center splash-fade-in px-6 py-10 rounded-[32px] border border-border/40 dark:border-dark-border/40 bg-surface/60 dark:bg-dark-surface/40 backdrop-blur-xl shadow-2xl relative">
          {/* Logo / Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-full overflow-hidden shadow-xl ring-4 ring-lavender/40 flex items-center justify-center animate-pulse">
              <img src="/mewwmory-icon.png" alt="Mewwmory" className="w-full h-full object-cover" />
            </div>
          </div>

          <h2 className="text-2xl md:text-3xl font-extrabold text-text-primary dark:text-dark-text tracking-tight mb-2">
            {userName ? `Welcome, ${userName}` : 'Welcome'}
          </h2>
          
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-lavender-light dark:bg-lavender-dark/20 text-lavender-dark dark:text-lavender mb-6">
            {currentMessage.tag}
          </span>

          <p className="text-lg md:text-xl font-medium text-text-secondary dark:text-dark-text-secondary leading-relaxed italic mb-8 px-2">
            "{currentMessage.text}"
          </p>

          <button
            onClick={handleEnter}
            className="w-full py-3.5 px-6 rounded-2xl bg-lavender-dark dark:bg-lavender text-white dark:text-dark-bg font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <span>Continue</span>
            <Sparkles size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row ambient-mood-bg transition-colors duration-300">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 p-4 border-r border-border/70 dark:border-dark-border/70 bg-surface/80 dark:bg-dark-surface/80 backdrop-blur-md">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-2 mb-8">
          <img src="/mewwmory-icon.png" alt="Mewwmory" className="w-8 h-8 rounded-full object-cover shadow-sm ring-2 ring-lavender/40 shrink-0" />
          <span className="font-extrabold text-lg text-text-primary dark:text-dark-text tracking-tight">
            Mewwmory
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link tap-spring ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button onClick={handleLogout} className="nav-link tap-spring text-left mt-auto hover:text-red-500">
          <LogOut size={20} />
          Log out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <PwaInstallBanner />
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav with backdrop blur (§5) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/85 dark:bg-dark-surface/85 backdrop-blur-lg border-t border-border/60 dark:border-dark-border/60 flex justify-around py-2 px-1 z-50 shadow-lg">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] sm:text-xs font-semibold tap-spring transition-colors ${
                isActive
                  ? 'text-lavender-dark dark:text-lavender font-bold'
                  : 'text-text-muted dark:text-dark-text-muted'
              }`
            }
          >
            <item.icon size={19} />
            <span className="truncate max-w-[52px] sm:max-w-none text-center leading-tight">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
