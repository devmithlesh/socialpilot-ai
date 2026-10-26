import { motion, AnimatePresence } from 'framer-motion';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PenSquare, CheckCircle2, Send,
  Link2, User, ChevronLeft, ChevronRight,
  LogOut, Sun, Moon, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAppDispatch, useAppSelector } from '../../store';
import { toggleSidebar, toggleTheme } from '../../store/slices/uiSlice';
import { clearCredentials } from '../../store/slices/authSlice';
import { Avatar } from '../ui';
import { useLogoutMutation } from '../../api/apiSlice';

const NAV_ITEMS = [
  { path: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { path: '/create', label: 'Create Post', icon: PenSquare },
  { path: '/approvals', label: 'Approval Queue', icon: CheckCircle2 },
  { path: '/published', label: 'Published Posts', icon: Send },
];

const BOTTOM_ITEMS = [
  { path: '/accounts', label: 'Connected Accounts', icon: Link2 },
  { path: '/profile', label: 'Profile & Settings', icon: User },
];

export function Sidebar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const theme = useAppSelector((s) => s.ui.theme);
  const user = useAppSelector((s) => s.auth.user);
  const [logout] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch {
      // Clear local state even if server request fails
    }
    dispatch(clearCredentials());
    navigate('/login');
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 260 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-0 top-0 h-screen z-30 flex flex-col border-r overflow-hidden"
      style={{
        background: 'var(--color-surface)',
        borderColor: 'var(--color-border)',
      }}
      aria-label="Main navigation"
    >
      {/* Logo + collapse toggle */}
      <div className="flex items-center justify-between px-4 h-16 border-b flex-shrink-0" style={{ borderColor: 'var(--color-border)' }}>
        <AnimatePresence mode="wait">
          {!collapsed ? (
            <motion.div
              key="logo-full"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2.5"
            >
              <div className="rounded-xl bg-brand-600 p-1.5 flex-shrink-0">
                <Zap size={16} className="text-white" />
              </div>
              <span className="font-bold text-sm text-gradient-strong">SocialPilot AI</span>
            </motion.div>
          ) : (
            <motion.div
              key="logo-icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto rounded-xl bg-brand-600 p-1.5"
            >
              <Zap size={16} className="text-white" />
            </motion.div>
          )}
        </AnimatePresence>

        {!collapsed && (
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="btn-icon text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" role="navigation">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} title={collapsed ? label : undefined}>
            {({ isActive }) => (
              <motion.div
                className={clsx('sidebar-item', isActive && 'active', collapsed && 'justify-center px-2')}
                whileHover={{ x: collapsed ? 0 : 2 }}
                transition={{ duration: 0.1 }}
              >
                <Icon size={18} className="flex-shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="divider my-4" />

        {BOTTOM_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} title={collapsed ? label : undefined}>
            {({ isActive }) => (
              <motion.div
                className={clsx('sidebar-item', isActive && 'active', collapsed && 'justify-center px-2')}
                whileHover={{ x: collapsed ? 0 : 2 }}
                transition={{ duration: 0.1 }}
              >
                <Icon size={18} className="flex-shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t px-3 py-3 flex-shrink-0 space-y-1" style={{ borderColor: 'var(--color-border)' }}>
        {/* Theme toggle */}
        <button
          onClick={() => dispatch(toggleTheme())}
          className={clsx('sidebar-item w-full', collapsed && 'justify-center px-2')}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? <Sun size={18} className="flex-shrink-0" /> : <Moon size={18} className="flex-shrink-0" />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="text-sm overflow-hidden whitespace-nowrap"
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Collapse toggle (when expanded) */}
        {collapsed && (
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="sidebar-item w-full justify-center px-2"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {/* User info + logout */}
        <div className={clsx('flex items-center gap-3 px-2 py-2', collapsed && 'justify-center')}>
          {user && <Avatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />}
          <AnimatePresence>
            {!collapsed && user && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="flex-1 min-w-0 overflow-hidden"
              >
                <p className="text-xs font-medium text-[var(--color-text)] truncate">{user.name}</p>
                <p className="text-xs text-[var(--color-text-subtle)] truncate">{user.email}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {!collapsed && (
            <button
              onClick={handleLogout}
              className="btn-icon text-[var(--color-text-muted)] hover:text-danger transition-colors"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
