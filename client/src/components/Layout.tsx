import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, PieChart, TrendingUp, ArrowLeftRight, Download, Info, LogOut, ListOrdered } from 'lucide-react';

// Logo GitHub ufficiale (octicon "mark-github") — lucide-react non espone più icone brand
function GithubIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
import { clearToken } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: BarChart3 },
  { to: '/allocation', label: 'Allocazione', icon: PieChart },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/movements', label: 'Movimenti', icon: ArrowLeftRight },
  { to: '/orders', label: 'Ordini', icon: ListOrdered },
  { to: '/import', label: 'Import', icon: Download },
  { to: '/about', label: 'About', icon: Info },
];

export default function Layout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const isMobile = useIsMobile();
  // Su mobile la sidebar aperta è sempre a larghezza piena (con titoli e label),
  // lo stato "collapsed" si applica solo su desktop.
  const showFull = !collapsed || isMobile;

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  // Chiudi il menu mobile quando si naviga
  const handleNavClick = () => {
    setMobileOpen(false);
  };

  // Logout: rimuove il token e reindirizza al login
  const handleLogout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex">
      {/* Overlay scuro per mobile — visibile solo quando menu aperto */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — su mobile: overlay fisso; su desktop: statico */}
      <aside
        className={`
          bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300
          ${showFull ? 'w-64' : 'w-16'}
          /* Mobile: fisso, nascosto di default, overlay quando mobileOpen */
          fixed lg:static inset-y-0 left-0 z-50
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header con titolo e toggle — clicca sul logo o sulla freccia per toggle */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="hidden lg:block"
            title={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {showFull ? (
              <h1 className="text-xl font-bold text-white">
                <span className="text-blue-400">Portfolio</span>
                <span className="text-green-400">Insights</span>
              </h1>
            ) : (
              <h1 className="text-xl font-bold text-white">
                <span className="text-blue-400">P</span>
                <span className="text-green-400">I</span>
              </h1>
            )}
          </button>
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="text-slate-400 hover:text-white transition-colors text-lg p-1 rounded-md hover:bg-slate-700/50 hidden lg:block"
            title={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Navigazione */}
        <nav className={`flex-1 space-y-1 ${showFull ? 'p-4' : 'p-2'}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={handleNavClick}
                className={({ isActive }) =>
                  `flex items-center rounded-lg text-sm font-medium transition-colors ${
                    showFull ? 'gap-3 px-4 py-3' : 'justify-center px-2 py-3'
                  } ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  }`
                }
                title={!showFull ? item.label : undefined}
              >
                <Icon size={20} />
                {showFull && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer — nascosto quando sidebar chiusa su desktop */}
        {showFull && (
          <div className="p-4 border-t border-slate-700 space-y-2">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={18} />
              <span>Esci</span>
            </button>
            <a
              href="https://github.com/massimobottelli/Portfolio-Insights"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-1 rounded-lg text-xs text-slate-500 hover:text-slate-300 hover:bg-slate-700/50 transition-colors"
              title="Repository GitHub"
            >
              <GithubIcon size={14} />
              <span>GitHub - Portfolio Insights</span>
            </a>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Pulsante hamburger per mobile */}
        <div className="lg:hidden flex items-center p-4 border-b border-slate-700 bg-slate-800">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-white transition-colors text-2xl p-1"
            title="Apri menu"
          >
            ☰
          </button>
          <h1 className="text-lg font-bold text-white ml-3">
            <span className="text-blue-400">Portfolio</span>
            <span className="text-green-400">Insights</span>
          </h1>
        </div>
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}