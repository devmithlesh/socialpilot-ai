import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { NotificationBell } from './NotificationBell';
import { useAppSelector } from '../../store';
import { Avatar } from '../ui';

export function AppLayout() {
  const location = useLocation();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const user = useAppSelector((s) => s.auth.user);

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--color-bg)' }}>
      <Sidebar />

      {/* Main content area — shifts based on sidebar width */}
      <motion.div
        animate={{ marginLeft: collapsed ? 64 : 260 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 min-w-0 flex flex-col min-h-screen"
      >
        {/* Top header */}
        <header
          className="sticky top-0 z-20 flex items-center justify-end h-16 px-6 border-b backdrop-blur-md"
          style={{
            background: 'rgba(var(--color-bg-rgb), 0.85)',
            borderColor: 'var(--color-border)',
          }}
        >
          <div className="flex items-center gap-2">
            <NotificationBell />

            {user && (
              <Link to="/profile" className="rounded-full" aria-label="Open profile and settings">
                <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
              </Link>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </motion.div>
    </div>
  );
}
