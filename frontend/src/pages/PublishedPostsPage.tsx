import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Send, ArrowRight, Maximize2 } from 'lucide-react';
import { format } from 'date-fns';
import { useGetPostsQuery } from '../api/apiSlice';
import { EmptyState, PlatformIcon, StatusBadge, Skeleton, Button } from '../components/ui';
import { ImageLightbox } from '../components/ImageLightbox';
import type { Post } from '../types';

function PublishedPostCard({ post }: { post: Post }) {
  const latest = post.versions?.[0];
  const imageUrl = latest?.imageUrl ?? '';
  const [showPreview, setShowPreview] = useState(false);

  return (
    <article className="card overflow-hidden p-0 h-full flex flex-col">
      <div className="relative bg-[var(--color-surface-2)]">
        {imageUrl ? (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="block w-full text-left"
            title="View full screen"
          >
            <img
              src={imageUrl}
              alt={latest?.imageAltText || 'Published post image'}
              className="w-full h-64 object-cover"
            />
          </button>
        ) : (
          <div className="w-full h-40 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
            No image
          </div>
        )}

        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 text-white px-2.5 py-1 text-xs">
            <PlatformIcon platform={post.platform} size={13} />
            {post.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}
          </span>
        </div>

        {imageUrl && (
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            title="View full screen"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <StatusBadge status={post.status} />

        <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-line line-clamp-4">
          {latest?.caption || 'No caption'}
        </p>

        {latest?.hashtags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {latest.hashtags.slice(0, 6).map((tag) => (
              <span key={tag} className="badge badge-approved text-[10px]">#{tag}</span>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-[var(--color-text-muted)] mt-auto">
          {post.connectedAccount?.platformDisplayName ? `${post.connectedAccount.platformDisplayName} · ` : ''}
          {post.publishedAt
            ? `Published ${format(new Date(post.publishedAt), 'MMM d, yyyy HH:mm')}`
            : 'Published'}
        </p>

        <Link to={`/posts/${post.id}`} className="block">
          <Button variant="secondary" size="sm" className="w-full" rightIcon={<ArrowRight size={13} />}>
            Details
          </Button>
        </Link>
      </div>

      <ImageLightbox
        src={imageUrl}
        alt={latest?.imageAltText || 'Published post image'}
        open={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </article>
  );
}

export function PublishedPostsPage() {
  const { data, isLoading } = useGetPostsQuery({ status: 'PUBLISHED', limit: 50 });
  const posts = data?.data ?? [];

  return (
    <div className=" mx-auto space-y-6">
      <div>
        <h1 className="page-title">Published Posts</h1>
        <p className="page-subtitle">Posts that have been successfully published to your connected accounts.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-80 rounded-2xl" />)}
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={<Send size={24} />}
          title="No published posts yet"
          description="Posts you've approved and published will appear here."
          action={
            <Link to="/create">
              <Button variant="primary" size="sm">Create your first post</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <PublishedPostCard post={post} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
