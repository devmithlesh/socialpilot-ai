import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FileText, Clock, CheckCircle, AlertCircle, Calendar, Sparkles,
  PenSquare, ArrowRight, Plus, Zap,
} from 'lucide-react';
import { useAppSelector } from '../store';
import { useGetDashboardQuery } from '../api/apiSlice';
import { StatCard, EmptyState, StatusBadge, PlatformIcon, Skeleton, Button } from '../components/ui';
import { format } from 'date-fns';

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { data, isLoading } = useGetDashboardQuery();

  const stats = data?.data?.stats;
  const recentPosts = data?.data?.recentPosts ?? [];
  const connectedAccounts = data?.data?.connectedAccounts ?? [];

  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">
            {greeting}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="page-subtitle">
            Here's what's happening with your social media today.
          </p>
        </div>
        <Link to="/create">
          <Button variant="primary" leftIcon={<PenSquare size={16} />}>
            Create Post
          </Button>
        </Link>
      </div>

      {/* Connection status banner */}
      {!isLoading && connectedAccounts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-brand-500/20 bg-brand-500/5 p-5 flex items-center gap-4"
        >
          <div className="rounded-xl bg-brand-500/10 p-3 flex-shrink-0">
            <Zap size={20} className="text-brand-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">
              Connect your social accounts to get started
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Connect LinkedIn or Instagram to create and publish posts directly from SocialPilot AI.
            </p>
          </div>
          <Link to="/accounts">
            <Button variant="primary" size="sm" rightIcon={<ArrowRight size={14} />}>
              Connect accounts
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              title="Drafts"
              value={stats?.drafts ?? 0}
              icon={<FileText size={20} />}
              color="brand"
              delay={0}
            />
            <StatCard
              title="Awaiting Approval"
              value={stats?.pendingApproval ?? 0}
              icon={<Clock size={20} />}
              color="warning"
              delay={0.05}
            />
            <StatCard
              title="Published"
              value={stats?.published ?? 0}
              icon={<CheckCircle size={20} />}
              color="success"
              delay={0.1}
            />
            <StatCard
              title="Failed"
              value={stats?.failed ?? 0}
              icon={<AlertCircle size={20} />}
              color="danger"
              delay={0.15}
            />
            <StatCard
              title="Scheduled"
              value={stats?.scheduled ?? 0}
              icon={<Calendar size={20} />}
              color="info"
              delay={0.2}
            />
          </>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Posts */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="card lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Recent Posts</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          ) : recentPosts.length === 0 ? (
            <EmptyState
              icon={<PenSquare size={24} />}
              title="No posts yet"
              description="Create your first post using AI or start from scratch."
              action={
                <Link to="/create">
                  <Button variant="primary" size="sm" leftIcon={<Sparkles size={14} />}>
                    Create with AI
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {recentPosts.map((post, index) => {
                const latestVersion = post.versions?.[0];
                return (
                  <motion.div
                    key={post.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * index }}
                    className="flex items-center gap-4 py-3"
                  >
                    <PlatformIcon platform={post.platform} size={18} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text)] truncate">
                        {latestVersion?.caption?.slice(0, 80) ?? 'No content'}
                        {(latestVersion?.caption?.length ?? 0) > 80 ? '...' : ''}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {format(new Date(post.updatedAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Connected Accounts */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Connected Accounts</h2>
            <Link to="/accounts" className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
              Manage
            </Link>
          </div>

          {connectedAccounts.length === 0 ? (
            <EmptyState
              icon={<Plus size={24} />}
              title="No accounts connected"
              description="Connect LinkedIn or Instagram to start publishing."
              action={
                <Link to="/accounts">
                  <Button variant="primary" size="sm">Connect account</Button>
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {connectedAccounts.map((account) => (
                <div key={`${account.platform}-${account.platformUsername}`} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
                  <PlatformIcon platform={account.platform} size={20} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {account.platformDisplayName}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {account.platformUsername}
                    </p>
                  </div>
                  <span className="h-2 w-2 rounded-full bg-success flex-shrink-0" aria-label="Connected" />
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
