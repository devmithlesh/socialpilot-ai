import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Edit3, Send, AlertTriangle, ArrowLeft,
  Clock, Hash, Megaphone, Shield, Info,
  Image as ImageIcon, UploadCloud, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import {
  useGetPostQuery,
  useApprovePostMutation,
  usePublishPostMutation,
  useSchedulePostMutation,
  useUpdatePostMutation,
  useGetAccountsQuery,
} from '../api/apiSlice';
import { Button, Modal, PlatformIcon, StatusBadge, Spinner } from '../components/ui';
import toast from 'react-hot-toast';

export function PostDetailPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [now] = useState(() => Date.now());
  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editCta, setEditCta] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const { data, isLoading, refetch } = useGetPostQuery(postId!, { skip: !postId });
  const { data: accountsData } = useGetAccountsQuery();
  const [approve, { isLoading: isApproving }] = useApprovePostMutation();
  const [publish, { isLoading: isPublishing }] = usePublishPostMutation();
  const [schedulePost, { isLoading: isScheduling }] = useSchedulePostMutation();
  const [updatePost, { isLoading: isUpdating }] = useUpdatePostMutation();

  const post = data?.data;
  const latestVersion = post?.versions?.[0];
  const accounts = accountsData?.data?.filter((a) => a.platform === post?.platform) ?? [];

  // Sync edit form with latest version
  useEffect(() => {
    if (latestVersion) {
      setEditCaption(latestVersion.caption);
      setEditHashtags(latestVersion.hashtags?.join(', ') || '');
      setEditCta(latestVersion.callToAction || '');
      setEditImageUrl(latestVersion.imageUrl || '');
    }
  }, [latestVersion]);

  const displayImageUrl = latestVersion?.imageUrl;

  const handleApprove = async () => {
    if (!postId || !selectedAccountId) {
      toast.error('Please select a destination account');
      return;
    }

    try {
      await approve({ postId, connectedAccountId: selectedAccountId }).unwrap();
      toast.success('Post approved! Ready for publishing.');
      await refetch();
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to approve post');
    }
  };

  const handlePublish = async () => {
    if (!postId) return;

    try {
      const result = await publish(postId).unwrap();
      if (result.success && result.data) {
        setShowPublishConfirm(false);
        toast.success('Post published successfully!');
        if (result.data.platformUrl) {
          window.open(result.data.platformUrl, '_blank', 'noopener,noreferrer');
        }
        navigate('/published');
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      setShowPublishConfirm(false);
      toast.error(error.data?.error?.message ?? 'Failed to publish post');
    }
  };

  const handleSchedulePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postId || !scheduleDateTime) {
      toast.error('Please select a date and time to schedule this post');
      return;
    }

    try {
      await schedulePost({
        postId,
        scheduledAt: new Date(scheduleDateTime).toISOString(),
      }).unwrap();

      toast.success(`Post scheduled for ${new Date(scheduleDateTime).toLocaleString()}!`);
      setShowScheduleModal(false);
      await refetch();
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to schedule post');
    }
  };

  const handleSavePostEdits = async () => {
    if (!postId) return;
    try {
      const hashtagsArray = editHashtags
        .split(',')
        .map((h) => h.trim().replace(/^#/, ''))
        .filter(Boolean);

      await updatePost({
        id: postId,
        content: {
          caption: editCaption,
          hashtags: hashtagsArray,
          callToAction: editCta || undefined,
          imageUrl: editImageUrl || undefined,
        },
      }).unwrap();

      toast.success('Post updated with a new version!');
      setIsEditing(false);
      await refetch();
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to update post');
    }
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setEditImageUrl(base64);
      toast.success('New image loaded from device!');
    };
    reader.readAsDataURL(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 gap-4">
        <AlertTriangle size={40} className="text-[var(--color-text-muted)]" />
        <p className="text-[var(--color-text-muted)]">Post not found</p>
        <Button onClick={() => navigate(-1)} leftIcon={<ArrowLeft size={14} />}>
          Go back
        </Button>
      </div>
    );
  }

  const isApprovalExpired = post.approval ? new Date(post.approval.expiresAt).getTime() < now : false;
  const canApprove = ['DRAFT', 'PENDING_APPROVAL', 'FAILED'].includes(post.status) && accounts.length > 0;
  const canPublish = post.status === 'APPROVED' && !post.approval?.isConsumed && !isApprovalExpired;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="btn-icon text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <PlatformIcon platform={post.platform} size={20} />
            <h1 className="text-lg font-semibold text-[var(--color-text)]">Post Review</h1>
            <StatusBadge status={post.status} />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Created {format(new Date(post.createdAt), 'MMM d, yyyy')} ·
            Version {latestVersion?.version ?? 1}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Edit3 size={14} />}
            onClick={() => setIsEditing(true)}
          >
            Edit Post
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Post preview column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[var(--color-border)]">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Post Content &amp; Visuals</h2>
            </div>

            {latestVersion ? (
              <div className="space-y-4">
                  <>
                    {/* Platform feed preview */}
                    <div className="rounded-xl border p-4 shadow-lg" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={post.platform} size={16} />
                          <span className="text-xs font-medium text-[var(--color-text-muted)]">
                            {post.platform === 'LINKEDIN' ? 'LinkedIn Preview' : 'Instagram Preview'}
                          </span>
                        </div>
                        <span className="text-[11px] text-brand-400 font-medium bg-brand-500/10 px-2 py-0.5 rounded-full border border-brand-500/20">
                          4:5 Social Media Post
                        </span>
                      </div>

                      {/* Visual Post Image */}
                      {displayImageUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] mb-4 group shadow-xl">
                          <img
                            src={displayImageUrl}
                            alt={latestVersion.imageAltText ?? 'Post image'}
                            className="w-full max-h-[580px] object-contain rounded-xl bg-[var(--color-surface-2)]"
                          />
                        </div>
                      ) : null}

                      {/* Caption text */}
                      <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-line">
                        {latestVersion.caption}
                      </p>

                      {/* Hashtags */}
                      {latestVersion.hashtags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {latestVersion.hashtags.map((tag) => (
                            <span key={tag} className={clsx(
                              'text-xs font-medium',
                              post.platform === 'LINKEDIN' ? 'text-[#0a66c2]' : 'text-[#e1306c]'
                            )}>
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Metadata boxes */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {latestVersion.callToAction && (
                        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
                          <Megaphone size={14} className="text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Call to Action</p>
                            <p className="text-xs text-[var(--color-text)]">{latestVersion.callToAction}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
                        <Hash size={14} className="text-[var(--color-text-muted)] mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Hashtags</p>
                          <p className="text-xs text-[var(--color-text)]">{latestVersion.hashtags.length} tags</p>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-[var(--color-text-subtle)]">
                      {latestVersion.caption.length} characters
                      {post.platform === 'LINKEDIN' && ' / 3,000 max'}
                      {post.platform === 'INSTAGRAM' && ' / 2,200 max'}
                    </p>
                  </>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-text-muted)]">No content yet</p>
            )}
          </div>

          {/* Version history */}
          {(post.versions?.length ?? 0) > 1 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Version History</h2>
              <div className="space-y-2">
                {post.versions?.map((version) => (
                  <div key={version.id} className={clsx(
                    'flex items-center gap-3 p-2 rounded-lg text-xs',
                    version.isLatest && 'bg-brand-500/5 border border-brand-500/10'
                  )}>
                    <span className="font-mono text-[var(--color-text-muted)]">v{version.version}</span>
                    <span className="text-[var(--color-text-muted)] flex-1 truncate">
                      {version.caption.slice(0, 50)}...
                    </span>
                    {version.isLatest && (
                      <span className="badge badge-approved text-[10px]">Current</span>
                    )}
                    <span className="text-[var(--color-text-subtle)]">
                      {format(new Date(version.createdAt), 'MMM d HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Approval sidebar */}
        <div className="space-y-4">

          {/* Approval status */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <Shield size={16} className="text-brand-400" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Approval Status</h2>
            </div>

            {post.approval && !isApprovalExpired ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 size={16} />
                  Post is approved
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  <p>Approved: {format(new Date(post.approval.approvedAt), 'MMM d, yyyy HH:mm')}</p>
                  <p>Expires: {format(new Date(post.approval.expiresAt), 'MMM d, yyyy HH:mm')}</p>
                </div>
                <div className="p-3 rounded-xl bg-info/5 border border-info/20 text-xs text-info flex gap-2">
                  <Info size={13} className="flex-shrink-0 mt-0.5" />
                  Editing this post will invalidate the current approval and require re-approval.
                </div>
              </div>
            ) : isApprovalExpired ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-warning">
                  <Clock size={16} />
                  Approval expired
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  The approval expired on {post.approval && format(new Date(post.approval.expiresAt), 'MMM d, yyyy HH:mm')}.
                  Please re-approve before publishing.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-text-muted)]">
                  This post requires your explicit approval before it can be published.
                </p>

                {accounts.length === 0 ? (
                  <div className="p-3 rounded-xl bg-warning/5 border border-warning/20 text-xs text-warning">
                    No {post.platform} account connected. Connect an account to approve and publish.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="label">Destination account</label>
                      <select
                        value={selectedAccountId}
                        onChange={(e) => setSelectedAccountId(e.target.value)}
                        className="input"
                        aria-label="Select destination account"
                      >
                        <option value="">Select account...</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.platformDisplayName} ({account.platformUsername})
                          </option>
                        ))}
                      </select>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={!canApprove || !selectedAccountId}
                      loading={isApproving}
                      onClick={handleApprove}
                      leftIcon={<CheckCircle2 size={16} />}
                    >
                      Approve Post
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Publish action */}
          {canPublish && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border border-brand-500/20 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-[var(--color-text)]">Ready to Publish</h2>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                Post is approved and verified. Choose to publish immediately or schedule for a specific date &amp; time.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => setShowPublishConfirm(true)}
                  leftIcon={<Send size={16} />}
                >
                  Approve &amp; Post Now
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setShowScheduleModal(true)}
                  leftIcon={<Clock size={15} className="text-brand-400" />}
                >
                  Schedule for Later
                </Button>
              </div>
            </motion.div>
          )}

          {/* Scheduled Status Banner */}
          {post.status === 'SCHEDULED' && post.scheduledAt && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border border-info/20 bg-info/5 space-y-3"
            >
              <div className="flex items-center gap-2 text-info">
                <Clock size={16} />
                <h2 className="text-sm font-semibold">Post is Scheduled</h2>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                This post is scheduled to publish on{' '}
                <strong className="text-[var(--color-text)]">
                  {format(new Date(post.scheduledAt), 'PPP')} at {format(new Date(post.scheduledAt), 'p')}
                </strong>.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowPublishConfirm(true)}
                  leftIcon={<Send size={13} />}
                >
                  Publish Now
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowScheduleModal(true)}
                >
                  Reschedule
                </Button>
              </div>
            </motion.div>
          )}

          {/* Publishing attempts */}
          {post.publishingAttempts && post.publishingAttempts.length > 0 && (
            <div className="card">
              <h2 className="text-sm font-semibold text-[var(--color-text)] mb-3">Publishing History</h2>
              <div className="space-y-2">
                {post.publishingAttempts.slice(0, 3).map((attempt) => (
                  <div key={attempt.id} className="flex items-center gap-2 text-xs">
                    {attempt.status === 'SUCCESS'
                      ? <CheckCircle2 size={12} className="text-success" />
                      : <AlertTriangle size={12} className="text-danger" />}
                    <span className="text-[var(--color-text-muted)]">
                      {attempt.status === 'SUCCESS' ? 'Published' : 'Failed'}
                    </span>
                    <span className="text-[var(--color-text-subtle)] ml-auto">
                      {format(new Date(attempt.attemptedAt), 'MMM d HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── LIVE POST EDITOR MODAL ─── */}
      <Modal
        open={isEditing}
        onClose={() => setIsEditing(false)}
        title="Edit Post Content & Visual"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Caption</label>
            <textarea
              className="input w-full resize-none font-sans text-sm"
              rows={7}
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder="Write or edit your post caption..."
            />
          </div>

          <div>
            <label className="label">Hashtags (comma-separated)</label>
            <input
              type="text"
              className="input w-full text-xs"
              value={editHashtags}
              onChange={(e) => setEditHashtags(e.target.value)}
              placeholder="frontend, webdev, javascript, react"
            />
          </div>

          <div>
            <label className="label">Call to Action (CTA)</label>
            <input
              type="text"
              className="input w-full text-xs"
              value={editCta}
              onChange={(e) => setEditCta(e.target.value)}
              placeholder="Engaging closing question or bookmark CTA"
            />
          </div>

          {/* Image & Visual options */}
          <div className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <ImageIcon size={14} className="text-brand-400" />
                Post Image / Visual
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFileChange}
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => fileInputRef.current?.click()}
                leftIcon={<UploadCloud size={14} />}
              >
                Upload New Image from Device
              </Button>
              {editImageUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-danger"
                  onClick={() => setEditImageUrl('')}
                >
                  Remove Image
                </Button>
              )}
            </div>

            {editImageUrl && (
              <div className="relative rounded-lg overflow-hidden border border-[var(--color-border)] max-h-40 bg-[var(--color-surface-2)]">
                <img
                  src={editImageUrl}
                  alt="Edit preview"
                  className="w-full max-h-40 object-contain"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={isUpdating}
              onClick={handleSavePostEdits}
              leftIcon={<Check size={16} />}
            >
              Save New Version
            </Button>
          </div>
        </div>
      </Modal>

      {/* Final publish confirmation modal */}
      <Modal
        open={showPublishConfirm}
        onClose={() => setShowPublishConfirm(false)}
        title="Confirm Publishing"
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-warning/20 bg-warning/5">
            <p className="text-sm font-medium text-[var(--color-text)] mb-1">
              ⚠️ You are about to publish this post
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              This will immediately publish the exact content shown below to{' '}
              <strong>{post.connectedAccount?.platformDisplayName}</strong> on{' '}
              <strong>{post.platform}</strong>. This action cannot be undone.
            </p>
          </div>

          {/* Final content preview */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <PlatformIcon platform={post.platform} size={14} />
              <span className="text-xs font-medium text-[var(--color-text-muted)]">
                Posting to: {post.connectedAccount?.platformDisplayName ?? post.platform}
              </span>
            </div>
            <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-line line-clamp-6">
              {latestVersion?.caption}
            </p>
            {latestVersion?.hashtags && latestVersion.hashtags.length > 0 && (
              <p className="text-xs text-brand-400 mt-2">
                {latestVersion.hashtags.map((h) => `#${h}`).join(' ')}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setShowPublishConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              loading={isPublishing}
              onClick={handlePublish}
              leftIcon={<Send size={16} />}
            >
              {isPublishing ? 'Publishing...' : 'Approve & Post'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Schedule for later modal */}
      <Modal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Schedule Post for Publishing"
        maxWidth="md"
      >
        <form onSubmit={handleSchedulePost} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300 flex items-center gap-2">
            <Clock size={16} className="flex-shrink-0" />
            <p>
              Choose a future date and time. Your post will be queued and scheduled for automatic publishing.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Publish Date &amp; Time
            </label>
            <input
              type="datetime-local"
              value={scheduleDateTime}
              onChange={(e) => setScheduleDateTime(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="input"
              required
            />
          </div>

          <div className="flex gap-3 pt-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowScheduleModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isScheduling}
              leftIcon={<Clock size={15} />}
            >
              Confirm Schedule
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
