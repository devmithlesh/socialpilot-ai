import { useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Pencil, Trash2, ArrowRight, Clock, Maximize2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useSchedulePostMutation, useUpdatePostMutation } from '../api/apiSlice';
import { Button, Modal, PlatformIcon, StatusBadge } from './ui';
import { ImageLightbox } from './ImageLightbox';
import type { Post } from '../types';

interface PostPreviewCardProps {
  post: Post;
  actionLabel?: string;
  actionTo?: string;
  showSchedule?: boolean;
}

function toDateTimeLocal(value?: string | null): string {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 60_000) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    fallback.setMinutes(0, 0, 0);
    return fallback.toISOString().slice(0, 16);
  }
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please upload an image file (PNG, JPG, WEBP)'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('Image must be less than 10MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.readAsDataURL(file);
  });
}

export function PostPreviewCard({ post, actionLabel = 'Review', actionTo, showSchedule = false }: PostPreviewCardProps) {
  const latest = post.versions?.[0];
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(latest?.caption ?? '');
  const [imageUrl, setImageUrl] = useState(latest?.imageUrl ?? '');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState(() => toDateTimeLocal(post.scheduledAt));
  const [updatePost, { isLoading }] = useUpdatePostMutation();
  const [schedulePost, { isLoading: isScheduling }] = useSchedulePostMutation();

  const save = async (nextCaption = caption, nextImage = imageUrl) => {
    if (!latest) return;
    try {
      await updatePost({
        id: post.id,
        content: {
          caption: nextCaption.trim() || latest.caption,
          hashtags: latest.hashtags ?? [],
          callToAction: latest.callToAction ?? undefined,
          imageUrl: nextImage || '',
          imageAltText: latest.imageAltText ?? undefined,
        },
      }).unwrap();
      toast.success('Post updated');
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to update post');
    }
  };

  const handleUpload = async (file: File) => {
    try {
      const dataUrl = await readImageFile(file);
      setImageUrl(dataUrl);
      await save(caption, dataUrl);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteImage = async () => {
    setImageUrl('');
    await save(caption, '');
  };

  const handleSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!scheduleDateTime) {
      toast.error('Choose a date and time');
      return;
    }
    try {
      await schedulePost({
        postId: post.id,
        scheduledAt: new Date(scheduleDateTime).toISOString(),
      }).unwrap();
      toast.success(`Scheduled for ${new Date(scheduleDateTime).toLocaleString()}`);
      setShowScheduleModal(false);
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to schedule post');
    }
  };

  return (
    <article className="card overflow-hidden p-0">
      <div className="relative bg-[var(--color-surface-2)]">
        {imageUrl ? (
          <button
            type="button"
            onClick={() => setShowImagePreview(true)}
            className="block w-full text-left"
            title="View full screen"
          >
            <img
              src={imageUrl}
              alt={latest?.imageAltText || 'Post image'}
              className="w-full max-h-80 object-cover"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-40 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
          >
            <ImagePlus size={22} />
            <span className="text-xs">Upload a photo</span>
          </button>
        )}

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 text-white px-2.5 py-1 text-xs">
            <PlatformIcon platform={post.platform} size={13} />
            {post.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}
          </span>
        </div>

        <div className="absolute top-3 right-3 flex gap-1.5">
          {imageUrl && (
            <button
              type="button"
              onClick={() => setShowImagePreview(true)}
              className="h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
              title="View full screen"
            >
              <Maximize2 size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            title="Upload photo"
          >
            <ImagePlus size={14} />
          </button>
          {imageUrl && (
            <button
              type="button"
              onClick={handleDeleteImage}
              disabled={isLoading}
              className="h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-rose-600"
              title="Delete photo"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUpload(file);
          e.target.value = '';
        }}
      />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <StatusBadge status={post.status} />
          <button
            type="button"
            onClick={() => navigate(`/create?postId=${post.id}`)}
            className="btn-ghost text-xs flex items-center gap-1"
          >
            <Pencil size={13} />
            Edit
          </button>
        </div>

        <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-line">
          {caption || 'No caption yet'}
        </p>

        {latest?.hashtags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {latest.hashtags.slice(0, 6).map((tag) => (
              <span key={tag} className="badge badge-approved text-[10px]">#{tag}</span>
            ))}
          </div>
        ) : null}

        {post.scheduledAt && (
          <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
            <Clock size={12} />
            {post.status === 'SCHEDULED' ? 'Publishes' : 'Planned for'}{' '}
            {format(new Date(post.scheduledAt), "EEE, MMM d 'at' h:mm a")}
          </p>
        )}

        <div className="flex gap-2">
          {showSchedule && (
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              leftIcon={<Clock size={13} />}
              onClick={() => {
                setScheduleDateTime(toDateTimeLocal(post.scheduledAt));
                setShowScheduleModal(true);
              }}
            >
              Schedule
            </Button>
          )}
          <Link to={actionTo ?? `/posts/${post.id}`} className="block flex-1">
            <Button variant="secondary" size="sm" className="w-full" rightIcon={<ArrowRight size={13} />}>
              {actionLabel}
            </Button>
          </Link>
        </div>
      </div>

      <ImageLightbox
        src={imageUrl}
        alt={latest?.imageAltText || 'Post image'}
        open={showImagePreview}
        onClose={() => setShowImagePreview(false)}
      />

      <Modal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Schedule this post"
        description="Approve first if needed. Then pick when it should go live."
        maxWidth="sm"
      >
        <form onSubmit={handleSchedule} className="space-y-4">
          <div>
            <label className="label" htmlFor={`schedule-${post.id}`}>Publish date & time</label>
            <input
              id={`schedule-${post.id}`}
              type="datetime-local"
              value={scheduleDateTime}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setScheduleDateTime(e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowScheduleModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isScheduling} leftIcon={<Clock size={14} />}>
              Confirm schedule
            </Button>
          </div>
        </form>
      </Modal>
    </article>
  );
}
