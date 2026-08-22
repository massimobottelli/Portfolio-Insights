import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BarChart3, PieChart, TrendingUp, ArrowLeftRight, Download, LogOut } from 'lucide-react';
import { clearToken } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: BarChart3 },
  { to: '/allocation', label: 'Allocazione', icon: PieChart },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/movements', label: 'Movimenti', icon: ArrowLeftRight },
  { to: '/import', label: 'Import', icon: Download },
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
            <div className="text-xs text-slate-500">
              MVP1 v1.0.0
            </div>
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