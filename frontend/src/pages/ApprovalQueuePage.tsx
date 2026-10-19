import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Calendar, ArrowRight, Send, Sparkles } from 'lucide-react';
import { useGetPostsQuery, useGenerateDailyPostMutation } from '../api/apiSlice';
import { Button, EmptyState, StatusBadge, PlatformIcon, Skeleton } from '../components/ui';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function ApprovalQueuePage() {
  const { data, isLoading, refetch: refetchPending } = useGetPostsQuery({ status: 'PENDING_APPROVAL' });
  const { data: approvedData, refetch: refetchApproved } = useGetPostsQuery({ status: 'APPROVED' });
  const { data: scheduledData, refetch: refetchScheduled } = useGetPostsQuery({ status: 'SCHEDULED' });
  const [generateDailyPost, { isLoading: isGeneratingDaily }] = useGenerateDailyPostMutation();

  const pendingPosts = data?.data ?? [];
  const approvedPosts = approvedData?.data ?? [];
  const scheduledPosts = [...(scheduledData?.data ?? [])].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime(),
  );
  const [twoHoursFromNow] = useState(() => Date.now() + 2 * 60 * 60 * 1000);

  const handleGenerateDaily = async () => {
    try {
      const res = await generateDailyPost().unwrap();
      toast.success(res.data?.message || 'Daily AI post generated and waiting for your approval!');
      await Promise.all([refetchPending(), refetchApproved(), refetchScheduled()]);
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to generate automated daily post');
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">
            Review and approve posts before publishing. No post can be published without your explicit approval.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleGenerateDaily}
          loading={isGeneratingDaily}
          leftIcon={<Sparkles size={15} />}
        >
          ⚡ Auto-Generate Today's Post
        </Button>
      </div>

      {/* Approved posts ready to publish */}
      {approvedPosts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={16} className="text-success" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Approved — Ready to Publish ({approvedPosts.length})
            </h2>
          </div>
          <div className="space-y-3">
            {approvedPosts.map((post, i) => {
              const latestVersion = post.versions?.[0];
              const isExpiring = post.approval && new Date(post.approval.expiresAt).getTime() < twoHoursFromNow;
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card border-l-4 border-l-brand-500 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <PlatformIcon platform={post.platform} size={18} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text)] truncate">
                          {latestVersion?.caption?.slice(0, 100)}...
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <StatusBadge status={post.status} />
                          {post.connectedAccount && (
                            <span className="text-xs text-[var(--color-text-muted)]">
                              → {post.connectedAccount.platformDisplayName}
                            </span>
                          )}
                          {isExpiring && (
                            <span className="flex items-center gap-1 text-xs text-warning">
                              <Clock size={11} /> Approval expiring soon
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link to={`/posts/${post.id}`}>
                      <Button variant="primary" size="sm" rightIcon={<Send size={13} />}>
                        Publish
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Scheduled — will be published automatically at the chosen time */}
      {scheduledPosts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={16} className="text-info" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Scheduled ({scheduledPosts.length})
            </h2>
          </div>
          <div className="space-y-3">
            {scheduledPosts.map((post) => (
              <div key={post.id} className="card border-l-4 border-l-info p-4 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <PlatformIcon platform={post.platform} size={18} />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-text)] truncate">
                      {post.versions?.[0]?.caption?.slice(0, 100)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      {post.scheduledAt ? format(new Date(post.scheduledAt), "EEE, MMM d 'at' h:mm a") : 'No time set'}
                    </p>
                  </div>
                </div>
                <Link to={`/posts/${post.id}`}>
                  <Button variant="secondary" size="sm" rightIcon={<ArrowRight size={13} />}>
                    Open
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Awaiting approval */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-warning" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Awaiting Approval ({pendingPosts.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : pendingPosts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={24} />}
            title="No posts awaiting approval"
            description="Posts you've drafted with AI will appear here for your review and approval."
            action={
              <Link to="/create">
                <Button variant="primary" size="sm" leftIcon={<Sparkles size={14} />}>
                  Create with AI
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {pendingPosts.map((post, i) => {
              const latestVersion = post.versions?.[0];
              return (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="card approval-required-ring p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <PlatformIcon platform={post.platform} size={18} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text)] line-clamp-2">
                          {latestVersion?.caption?.slice(0, 150)}
                        </p>
                        <div className="flex items-center gap-3 mt-2">
                          <StatusBadge status={post.status} />
                          <span className="text-xs text-[var(--color-text-muted)]">
                            {format(new Date(post.updatedAt), 'MMM d, yyyy')}
                          </span>
                          {latestVersion?.hashtags?.length > 0 && (
                            <span className="text-xs text-[var(--color-text-subtle)]">
                              {latestVersion.hashtags.length} hashtags
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Link to={`/posts/${post.id}`}>
                      <Button variant="secondary" size="sm" rightIcon={<ArrowRight size={13} />}>
                        Review
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
