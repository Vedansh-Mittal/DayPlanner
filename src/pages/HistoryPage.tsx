import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, addMonths, subMonths, parse, isToday,
} from 'date-fns';
import { MOOD_COLOR_MAP, MOOD_OPTIONS, type MoodOption, type SearchResult, type DailyEntryFull } from '../types/database';
import { isMorningComplete, isNightComplete, truncate, extractSnippet } from '../lib/utils';
import {
  ChevronLeft, ChevronRight, Search, Calendar, X,
  Sun as SunIcon, Moon, Loader2, Flame, Sparkles, BookOpen,
} from 'lucide-react';

export const HistoryPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<Record<string, Partial<DailyEntryFull>>>({});
  const [loadingCal, setLoadingCal] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Load calendar data for current month (merging Supabase + latest local offline cache)
  const loadCalendar = useCallback(async () => {
    if (!user) return;
    setLoadingCal(true);
    const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

    const { data } = await supabase
      .from('daily_entries')
      .select('*, priorities(*), action_steps(*), meals(*), wind_down_items(*)')
      .eq('user_id', user.id)
      .gte('entry_date', monthStart)
      .lte('entry_date', monthEnd);

    const map: Record<string, Partial<DailyEntryFull>> = {};
    ((data as Partial<DailyEntryFull>[]) || []).forEach((e) => {
      if (e.entry_date) {
        map[e.entry_date] = e;
      }
    });

    // Merge offline cache so instant edits on PlannerPage are immediately visible in History calendar!
    try {
      const cacheStr = localStorage.getItem('daylight_offline_cache');
      if (cacheStr) {
        const cache = JSON.parse(cacheStr);
        Object.keys(cache).forEach((d) => {
          if (d >= monthStart && d <= monthEnd) {
            map[d] = {
              ...(map[d] || {}),
              ...cache[d],
            };
          }
        });
      }
    } catch (e) {
      console.error('Error merging offline cache into calendar:', e);
    }

    setCalendarData(map);
    setLoadingCal(false);
  }, [user, currentMonth]);

  useEffect(() => {
    loadCalendar();
    window.addEventListener('focus', loadCalendar);
    return () => window.removeEventListener('focus', loadCalendar);
  }, [loadCalendar]);

  // Derived memory statistics
  const monthEntries = Object.values(calendarData);
  const totalEntriesLogged = monthEntries.length;
  const fullDaysCompleted = monthEntries.filter(
    (e: any) =>
      (e.morning_completed || isMorningComplete(e, e.priorities || [], e.action_steps || [])) &&
      (e.night_completed || isNightComplete(e, e.meals || [], e.wind_down_items || []))
  ).length;

  // Search
  const handleSearch = async () => {
    if (!searchQuery.trim() || !user) return;
    setSearching(true);
    setHasSearched(true);

    const { data, error } = await supabase.rpc('search_entries', {
      search_query: searchQuery.trim(),
    });

    if (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } else {
      setSearchResults(data || []);
    }
    setSearching(false);
  };

  // Calendar rendering
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDay = getDay(monthStart); // 0=Sun

  const navigateToDate = (dateStr: string) => {
    navigate(`/app?date=${dateStr}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-text-primary dark:text-dark-text">
          <Calendar size={24} className="inline mr-2 text-lavender" />
          History & Memory Archive
        </h1>
        <p className="text-sm text-text-secondary dark:text-dark-text-secondary mt-1">
          Explore past journal reflections, daily wins, and cherished notes.
        </p>
      </div>

      {/* Memory Stats & Highlights Banner */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <BookOpen size={20} />
          </div>
          <div>
            <div className="text-lg font-black text-text-primary dark:text-dark-text leading-tight">
              {totalEntriesLogged}
            </div>
            <div className="text-[11px] font-bold text-text-muted dark:text-dark-text-muted uppercase tracking-wider">
              Entries Logged
            </div>
          </div>
        </div>

        <div className="card p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Flame size={20} />
          </div>
          <div>
            <div className="text-lg font-black text-text-primary dark:text-dark-text leading-tight">
              {fullDaysCompleted}
            </div>
            <div className="text-[11px] font-bold text-text-muted dark:text-dark-text-muted uppercase tracking-wider">
              Full Days Complete
            </div>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 card p-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            <Sparkles size={20} />
          </div>
          <div>
            <div className="text-lg font-black text-text-primary dark:text-dark-text leading-tight">
              {format(currentMonth, 'MMM yyyy')}
            </div>
            <div className="text-[11px] font-bold text-text-muted dark:text-dark-text-muted uppercase tracking-wider">
              Current View
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              className="input-field pl-9"
              placeholder="Search notes, priorities, reflections…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                onClick={() => { setSearchQuery(''); setHasSearched(false); setSearchResults([]); }}
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button className="btn-primary px-4" onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
          </button>
        </div>

        {/* Search results */}
        {hasSearched && (
          <div className="mt-4 space-y-3">
            {searching ? (
              <div className="text-center py-6 text-text-muted">
                <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                Searching…
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-6 text-text-muted dark:text-dark-text-muted">
                <Search size={24} className="mx-auto mb-2 opacity-40" />
                <p>No results found for "{searchQuery}"</p>
                <p className="text-xs mt-1">Try different keywords or check spelling</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </p>
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.entry_id}-${r.match_source}-${i}`}
                    className="card card-hover w-full text-left p-4"
                    onClick={() => navigateToDate(r.entry_date)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm">
                        {format(parse(r.entry_date, 'yyyy-MM-dd', new Date()), 'EEEE, MMM d')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {r.morning_mood && (
                          <span
                            className="text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                            style={MOOD_COLOR_MAP[r.morning_mood as MoodOption] ? { backgroundColor: `${MOOD_COLOR_MAP[r.morning_mood as MoodOption]}40` } : undefined}
                          >
                            ☀️ {r.morning_mood}
                          </span>
                        )}
                        {r.night_mood ? (
                          <span
                            className="text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200"
                            style={MOOD_COLOR_MAP[r.night_mood as MoodOption] ? { backgroundColor: `${MOOD_COLOR_MAP[r.night_mood as MoodOption]}40` } : undefined}
                          >
                            🌙 {r.night_mood}
                          </span>
                        ) : (
                          <Moon size={15} className="text-text-muted opacity-60 ml-0.5" />
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-text-secondary dark:text-dark-text-secondary">
                      <span className="text-xs font-semibold text-text-muted uppercase mr-1">{r.match_source}:</span>
                      {extractSnippet(r.matched_text, searchQuery)}
                    </p>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Calendar */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft size={20} />
          </button>
          <h2 className="text-lg font-bold">{format(currentMonth, 'MMMM yyyy')}</h2>
          <button className="btn-ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-bold text-text-muted dark:text-dark-text-muted py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for start */}
          {Array.from({ length: startDay }, (_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const isFutureDate = dateStr > todayStr;
            const data = calendarData[dateStr];
            const todayClass = isToday(day) ? 'today' : '';
            const activeMoodKey = data?.morning_mood || data?.night_mood;
            const moodColor = activeMoodKey ? MOOD_COLOR_MAP[activeMoodKey as MoodOption] : undefined;

            const isMorningDone = data
              ? data.morning_completed || isMorningComplete(data, data.priorities || [], data.action_steps || [])
              : false;
            const isNightDone = data
              ? data.night_completed || isNightComplete(data, data.meals || [], data.wind_down_items || [])
              : false;
            const isFullDone = isMorningDone && isNightDone;
            const isPartialDone = data
              ? !isFullDone && (
                  isMorningDone ||
                  isNightDone ||
                  !!data.daily_note?.trim() ||
                  (typeof data.water_count === 'number' && data.water_count > 0)
                )
              : false;

             return (
              <button
                key={dateStr}
                className={`cal-day min-h-[60px] p-2 flex flex-col justify-between overflow-hidden tap-spring rounded-2xl border border-border/50 dark:border-dark-border/50 ${todayClass} ${isFutureDate ? 'opacity-30 cursor-not-allowed' : 'hover:scale-[1.03] hover:shadow-md'}`}
                onClick={() => !isFutureDate && navigateToDate(dateStr)}
                disabled={isFutureDate}
                title={isFutureDate ? 'Future date locked' : undefined}
                style={moodColor ? { backgroundColor: `${moodColor}25` } : undefined}
              >
                {/* Header row: Day Number + Completion Dot (Green / Yellow / Lock) */}
                <div className="flex items-center justify-between w-full">
                  <span className="font-bold text-xs text-text-primary dark:text-dark-text">{format(day, 'd')}</span>
                  {isFutureDate ? (
                    <span className="text-[10px] opacity-60">🔒</span>
                  ) : isFullDone ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900/40 block shrink-0" title="Fully Completed" />
                  ) : isPartialDone ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-200 dark:ring-amber-900/40 block shrink-0" title="Partially Completed" />
                  ) : null}
                </div>

                {/* Daily Note snippet preview ONLY (no mood emojis) */}
                {!isFutureDate && data?.daily_note?.trim() && (
                  <div className="w-full mt-auto pt-1">
                    <span className="text-[9px] font-medium text-text-secondary dark:text-dark-text-secondary leading-tight truncate block text-left" title={data.daily_note.trim()}>
                      {truncate(data.daily_note.trim(), 10)}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-4 text-xs font-medium text-text-muted dark:text-dark-text-muted">
          <span className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Fully Completed
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Partially Left
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-xs opacity-60">🔒</span> Future Date Locked
          </span>
        </div>
      </div>
    </div>
  );
};
