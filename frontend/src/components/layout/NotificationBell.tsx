import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useGetNotificationsQuery, useMarkNotificationReadMutation } from '../../api/apiSlice';

/** Notification dropdown backed by the real notifications API (approvals needed, publish results). */
export function NotificationBell() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const { data } = useGetNotificationsQuery(undefined, { pollingInterval: 60_000 });
  const [markRead] = useMarkNotificationReadMutation();

  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (id: string, isRead: boolean, postId?: string) => {
    if (!isRead) void markRead(id);
    setOpen(false);
    if (postId) navigate(`/posts/${postId}`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-icon relative text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-brand-600 text-white text-[10px] leading-4 text-center font-semibold"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border overflow-hidden z-30"
            style={{
              background: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              boxShadow: 'var(--shadow-card-hover)',
            }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Notifications</h2>
            </div>

            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
                You're all caught up.
              </p>
            ) : (
              <ul className="max-h-96 overflow-y-auto divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(n.id, n.isRead, n.data?.postId)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--color-surface-2)] transition-colors flex gap-3"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${n.isRead ? 'bg-transparent' : 'bg-brand-500'}`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-[var(--color-text)]">{n.title}</span>
                        {n.body && (
                          <span className="block text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{n.body}</span>
                        )}
                        <span className="block text-[11px] text-[var(--color-text-subtle)] mt-1">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
