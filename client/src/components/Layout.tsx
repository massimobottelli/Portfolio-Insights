import { useEffect, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/portfolio', label: 'Portfolio', icon: '📊' },
  { to: '/import', label: 'Import', icon: '📥' },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState<boolean>(() =>
    localStorage.getItem('sidebarCollapsed') === 'true'
  );

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside
        className={`bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Header con titolo e toggle */}
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          {collapsed ? (
            <h1 className="text-xl font-bold text-white mx-auto">
              <span className="text-blue-400">P</span>
              <span className="text-green-400">I</span>
            </h1>
          ) : (
            <h1 className="text-xl font-bold text-white">
              <span className="text-blue-400">Portfolio</span>
              <span className="text-green-400">Insights</span>
            </h1>
          )}
          <button
            onClick={() => setCollapsed(prev => !prev)}
            className="text-slate-400 hover:text-white transition-colors text-lg p-1 rounded-md hover:bg-slate-700/50"
            title={collapsed ? 'Espandi sidebar' : 'Comprimi sidebar'}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        {/* Navigazione */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? 'justify-center' : ''
                } ${
                  isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="text-lg">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer — nascosto quando sidebar chiusa */}
        {!collapsed && (
          <div className="p-4 border-t border-slate-700 text-xs text-slate-500">
            MVP1 v1.0.0
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}