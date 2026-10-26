import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Send, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { useGetPostsQuery } from '../api/apiSlice';
import { EmptyState, PlatformIcon, StatusBadge, Skeleton, Button } from '../components/ui';

export function PublishedPostsPage() {
  const { data, isLoading } = useGetPostsQuery({ status: 'PUBLISHED', limit: 20 });
  const posts = data?.data ?? [];

  return (
    <div className=" mx-auto space-y-6">
      <div>
        <h1 className="page-title">Published Posts</h1>
        <p className="page-subtitle">Posts that have been successfully published to your connected accounts.</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
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
        <div className="space-y-3">
          {posts.map((post, i) => {
            const latestVersion = post.versions?.[0];
            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card p-4"
              >
                <div className="flex items-start gap-4">
                  <PlatformIcon platform={post.platform} size={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--color-text)] line-clamp-2">
                      {latestVersion?.caption}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <StatusBadge status={post.status} />
                      {post.connectedAccount && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {post.connectedAccount.platformDisplayName}
                        </span>
                      )}
                      {post.publishedAt && (
                        <span className="text-xs text-[var(--color-text-subtle)]">
                          Published {format(new Date(post.publishedAt), 'MMM d, yyyy HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link to={`/posts/${post.id}`}>
                    <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={13} />}>
                      Details
                    </Button>
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
