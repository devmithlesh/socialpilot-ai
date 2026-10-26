import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, Calendar, ArrowRight, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { addDays, eachDayOfInterval, format, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';
import { useGetPostsQuery, useGenerateDailyPostMutation, useGetTelegramStatusQuery } from '../api/apiSlice';
import { Button, EmptyState, PlatformIcon, Skeleton, Textarea } from '../components/ui';
import { DateRangeCalendar, clampRange, countDays } from '../components/DateRangeCalendar';
import { PostPreviewCard } from '../components/PostPreviewCard';
import type { SocialPlatform } from '../types';

const PLATFORMS: SocialPlatform[] = ['LINKEDIN', 'INSTAGRAM'];
const MAX_DAYS = 7;

function atLocalTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(day);
  next.setHours(hours || 9, minutes || 0, 0, 0);
  return next;
}

export function ApprovalQueuePage() {
  const { data, isLoading, refetch: refetchPending } = useGetPostsQuery({ status: 'PENDING_APPROVAL', limit: 50 });
  const { data: approvedData, refetch: refetchApproved } = useGetPostsQuery({ status: 'APPROVED', limit: 50 });
  const { data: scheduledData, refetch: refetchScheduled } = useGetPostsQuery({ status: 'SCHEDULED', limit: 50 });
  const [generateDailyPost, { isLoading: isGeneratingDaily }] = useGenerateDailyPostMutation();
  const { data: telegramRes } = useGetTelegramStatusQuery();
  const telegramConnected = Boolean(telegramRes?.data?.connected);

  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(['LINKEDIN']);
  const [withImage, setWithImage] = useState(true);
  const [rangeStart, setRangeStart] = useState(() => startOfDay(new Date()));
  const [rangeEnd, setRangeEnd] = useState(() => startOfDay(new Date()));
  const [publishTime, setPublishTime] = useState('09:00');

  const pendingPosts = data?.data ?? [];
  const approvedPosts = approvedData?.data ?? [];
  const scheduledPosts = [...(scheduledData?.data ?? [])].sort(
    (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime(),
  );

  const topicReady = topic.trim().length > 0;
  const days = useMemo(() => countDays(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const postCount = days * platforms.length;

  const applyPreset = (length: number) => {
    const start = startOfDay(new Date());
    const end = addDays(start, length - 1);
    const next = clampRange(start, end, MAX_DAYS);
    setRangeStart(next.start);
    setRangeEnd(next.end);
  };

  const togglePlatform = (platform: SocialPlatform) => {
    setPlatforms((current) => (
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    ));
  };

  const handleGenerateDaily = async () => {
    if (!topic.trim()) {
      toast.error('Write what this post should be about');
      return;
    }
    if (platforms.length === 0) {
      toast.error('Select at least one platform');
      return;
    }

    const scheduledTimes = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
      .slice(0, MAX_DAYS)
      .map((day) => atLocalTime(day, publishTime).toISOString());

    try {
      const res = await generateDailyPost({
        topic: topic.trim(),
        platforms,
        withImage,
        scheduledTimes,
      }).unwrap();
      toast.success(res.data?.message || 'Posts generated and waiting for your approval!');
      await Promise.all([refetchPending(), refetchApproved(), refetchScheduled()]);
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to generate post');
    }
  };

  return (
    <div className=" mx-auto space-y-8">
      <div>
        <h1 className="page-title">Approval Queue</h1>
        <p className="page-subtitle">
          Write a topic, pick the days, then review each card
          {telegramConnected ? ' here or in Telegram' : ' here'}. Approve to publish on LinkedIn.
        </p>
      </div>

      <section className="card space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-400" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Auto-generate posts</h2>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          Fill the topic yourself. After that, choose how many days to generate for.
          {telegramConnected
            ? ' Connected Telegram chats get the same drafts with Approve and Reject buttons.'
            : ' Connect Telegram in Profile to review and approve from your phone.'}
        </p>

        <div>
          <label className="label">Platform</label>
          <p className="text-[11px] text-[var(--color-text-muted)] mb-2">Select one or both</p>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((platform) => {
              const selected = platforms.includes(platform);
              return (
                <button
                  key={platform}
                  type="button"
                  onClick={() => togglePlatform(platform)}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                    selected
                      ? 'border-brand-500/50 bg-brand-500/5'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-subtle)]'
                  )}
                >
                  <PlatformIcon platform={platform} size={18} />
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}
                  </span>
                  {selected && (
                    <CheckCircle2 size={14} className="ml-auto text-brand-400" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Textarea
          label="What should this post be about? *"
          placeholder="e.g. Frontend Developer Roadmap, a product launch, or one useful tip"
          rows={3}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <AnimatePresence>
          {topicReady && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="space-y-3"
            >
              <div>
                <label className="label">How many days should we generate posts for?</label>
                <p className="text-[11px] text-[var(--color-text-muted)] mb-2">
                  One unique post per day, then you approve and schedule each one.
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {[
                    { label: 'Today', days: 1 },
                    { label: '3 days', days: 3 },
                    { label: '7 days', days: 7 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => applyPreset(preset.days)}
                      className={clsx(
                        'px-3 py-1.5 rounded-full text-xs border transition-colors',
                        days === preset.days
                          ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-subtle)]'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <DateRangeCalendar
                  start={rangeStart}
                  end={rangeEnd}
                  onChange={(start, end) => {
                    setRangeStart(start);
                    setRangeEnd(end);
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="publish-time">Daily publish time</label>
                  <input
                    id="publish-time"
                    type="time"
                    value={publishTime}
                    onChange={(e) => setPublishTime(e.target.value)}
                    className="input"
                  />
                </div>
                <div className="rounded-xl border p-3 flex items-center gap-3" style={{ borderColor: 'var(--color-border)' }}>
                  <Calendar size={16} className="text-brand-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {days} {days === 1 ? 'day' : 'days'} · {postCount} {postCount === 1 ? 'post' : 'posts'}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {format(rangeStart, 'MMM d')}
                      {days > 1 ? ` – ${format(rangeEnd, 'MMM d')}` : ''} at {publishTime}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors" style={{ borderColor: 'var(--color-border)' }}>
          <input
            type="checkbox"
            checked={withImage}
            onChange={(e) => setWithImage(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--color-brand,#7c3aed)]"
          />
          <span>
            <span className="block text-sm font-medium text-[var(--color-text)]">Generate a detailed matching image</span>
            <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
              The image will explain the topic so a beginner can understand it.
            </span>
          </span>
        </label>

        <Button
          variant="primary"
          onClick={() => void handleGenerateDaily()}
          loading={isGeneratingDaily}
          leftIcon={<Sparkles size={15} />}
          className="w-full sm:w-auto"
          disabled={!topicReady || platforms.length === 0}
        >
          {isGeneratingDaily
            ? `Generating ${postCount} ${postCount === 1 ? 'post' : 'posts'}...`
            : postCount > 1
              ? `Generate ${postCount} posts`
              : 'Generate post'}
        </Button>
        {topicReady && withImage && postCount > 1 && (
          <p className="text-[11px] text-[var(--color-text-muted)]">
            This can take a few minutes because each day gets its own caption and image.
          </p>
        )}
      </section>

      {approvedPosts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={16} className="text-success" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Approved — Publish or schedule ({approvedPosts.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {approvedPosts.map((post) => (
              <PostPreviewCard key={post.id} post={post} actionLabel="Publish now" showSchedule />
            ))}
          </div>
        </section>
      )}

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

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-warning" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Awaiting Approval ({pendingPosts.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : pendingPosts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={24} />}
            title="No posts awaiting approval"
            description="Generate posts above. Each one appears here as a card you can edit, then approve."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingPosts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <PostPreviewCard post={post} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
