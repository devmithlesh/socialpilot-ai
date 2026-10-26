import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sparkles, CheckCircle2, Copy, ArrowRight, Image as ImageIcon,
  UploadCloud, Trash2, Maximize2,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  useGenerateContentMutation,
  useGenerateImageMutation,
  useGetPostQuery,
  useUpdatePostMutation,
} from '../api/apiSlice';
import { Button, Textarea, PlatformIcon } from '../components/ui';
import { ImageLightbox } from '../components/ImageLightbox';
import type { GeneratedContent, SocialPlatform } from '../types';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';

const PLATFORMS = ['LINKEDIN', 'INSTAGRAM'] as const;

const formSchema = z.object({
  topic: z.string().trim().min(1, 'Enter a topic'),
  platforms: z.array(z.enum(['LINKEDIN', 'INSTAGRAM'])).min(1, 'Select at least one platform'),
});

type FormValues = z.infer<typeof formSchema>;

type PlatformDraft = {
  platform: SocialPlatform;
  content: GeneratedContent;
  postId: string;
  caption: string;
  hashtags: string[];
  cta: string;
};

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

export function AIStudioPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editPostId = searchParams.get('postId');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [drafts, setDrafts] = useState<PlatformDraft[]>([]);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>('LINKEDIN');
  const [isEditing, setIsEditing] = useState(false);
  const [withImage, setWithImage] = useState(true);
  const [showImagePreview, setShowImagePreview] = useState(false);

  const [generate, { isLoading }] = useGenerateContentMutation();
  const [updatePost, { isLoading: isSaving }] = useUpdatePostMutation();
  const [generateImage, { isLoading: isGeneratingImage }] = useGenerateImageMutation();
  const { data: editPostData } = useGetPostQuery(editPostId ?? '', { skip: !editPostId });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { platforms: ['LINKEDIN'] },
  });

  const selectedPlatforms = watch('platforms');
  const activeDraft = drafts.find((draft) => draft.platform === activePlatform) ?? drafts[0] ?? null;
  const isEditMode = Boolean(editPostId);

  useEffect(() => {
    const post = editPostData?.data;
    const latest = post?.versions?.[0];
    if (!post || !latest) return;

    setDrafts([{
      platform: post.platform,
      content: {
        caption: latest.caption,
        hashtags: latest.hashtags ?? [],
        callToAction: latest.callToAction ?? '',
        imageUrl: latest.imageUrl ?? undefined,
        imageAltText: latest.imageAltText ?? undefined,
      },
      postId: post.id,
      caption: latest.caption,
      hashtags: latest.hashtags ?? [],
      cta: latest.callToAction ?? '',
    }]);
    setActivePlatform(post.platform);
    setValue('platforms', [post.platform], { shouldValidate: true });
    setValue('topic', latest.caption.split('\n')[0] || '', { shouldValidate: true });
    setIsEditing(true);
  }, [editPostData, setValue]);

  const togglePlatform = (platform: SocialPlatform) => {
    const next = selectedPlatforms.includes(platform)
      ? selectedPlatforms.filter((item) => item !== platform)
      : [...selectedPlatforms, platform];
    setValue('platforms', next, { shouldValidate: true });
  };

  const applyDraftUpdate = (platform: SocialPlatform, patch: Partial<PlatformDraft>) => {
    setDrafts((current) => current.map((draft) => (
      draft.platform === platform ? { ...draft, ...patch } : draft
    )));
  };

  const onGenerate = handleSubmit(async (values) => {
    const created: PlatformDraft[] = [];
    let imageWarning = false;

    try {
      for (const platform of values.platforms) {
        const result = await generate({
          topic: values.topic.trim(),
          platform,
          withImage,
          postId: isEditMode && platform === activeDraft?.platform ? activeDraft.postId : undefined,
        }).unwrap();

        if (result.success && result.data) {
          created.push({
            platform,
            content: result.data.content,
            postId: result.data.postId,
            caption: result.data.content.caption,
            hashtags: result.data.content.hashtags || [],
            cta: result.data.content.callToAction || '',
          });
          if (result.data.imageWarning) imageWarning = true;
        }
      }

      if (created.length === 0) {
        toast.error('Failed to generate content');
        return;
      }

      setDrafts(created);
      setActivePlatform(created[0].platform);
      setIsEditing(false);
      toast.success(
        created.length > 1
          ? `Drafts saved for ${created.map((draft) => draft.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram').join(' and ')}`
          : 'Content generated and saved as draft'
      );
      if (imageWarning) {
        toast.error('Post text is ready, but the image could not be generated. You can retry from the post editor.');
      }
    } catch (err: unknown) {
      if (created.length > 0) {
        setDrafts(created);
        setActivePlatform(created[0].platform);
      }
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to generate content');
    }
  });

  const copyToClipboard = async () => {
    if (!activeDraft) return;
    const activeHashtags = activeDraft.hashtags.length > 0 ? activeDraft.hashtags : (activeDraft.content.hashtags ?? []);
    const parts = [
      activeDraft.caption || activeDraft.content.caption,
      activeDraft.cta || activeDraft.content.callToAction,
      activeHashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '),
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join('\n\n'));
    toast.success('Copied caption & hashtags to clipboard');
  };

  const goToApproval = () => {
    if (activeDraft?.postId) {
      navigate(`/posts/${activeDraft.postId}`);
    }
  };

  const saveEdits = async () => {
    if (!activeDraft?.postId) return;
    try {
      await updatePost({
        id: activeDraft.postId,
        content: {
          caption: activeDraft.caption.trim() || activeDraft.content.caption,
          hashtags: activeDraft.hashtags,
          callToAction: activeDraft.cta || undefined,
          imageUrl: activeDraft.content.imageUrl || '',
          imageAltText: activeDraft.content.imageAltText,
        },
      }).unwrap();
      toast.success('Post updated');
      navigate(`/posts/${activeDraft.postId}`);
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to save post');
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!activeDraft) return;
    try {
      const dataUrl = await readImageFile(file);
      applyDraftUpdate(activeDraft.platform, {
        content: { ...activeDraft.content, imageUrl: dataUrl },
      });
      toast.success('Photo added');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleGenerateImage = async () => {
    if (!activeDraft) return;
    const caption = activeDraft.caption.trim() || activeDraft.content.caption;
    if (!caption) {
      toast.error('Write the caption first — the image is generated from it.');
      return;
    }
    try {
      const res = await generateImage({
        caption,
        platform: activeDraft.platform,
        topic: watch('topic'),
      }).unwrap();
      if (res.data) {
        applyDraftUpdate(activeDraft.platform, {
          content: {
            ...activeDraft.content,
            imageUrl: res.data.imageUrl,
            imageAltText: res.data.imageAltText,
          },
        });
        toast.success('Image generated. Save to keep it.');
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Image generation failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="page-title">{isEditMode ? 'Edit Post' : 'AI Content Studio'}</h1>
        <p className="page-subtitle">
          {isEditMode
            ? 'Change the caption, image, or hashtags here, then save.'
            : 'Generate platform-optimized social media content powered by ChatGPT.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="card space-y-4"
        >
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Content Requirements</h2>

          <form onSubmit={onGenerate} className="space-y-4" noValidate>
            <div>
              <label className="label">Platform</label>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-2">Select one or both</p>
              <div className="grid grid-cols-2 gap-2">
                {PLATFORMS.map((platform) => {
                  const selected = selectedPlatforms.includes(platform);
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
              {errors.platforms && (
                <p className="text-xs text-danger mt-1.5">{errors.platforms.message}</p>
              )}
            </div>

            <Textarea
              label="Topic *"
              placeholder="e.g. Frontend Developer Roadmap"
              rows={3}
              error={errors.topic?.message}
              {...register('topic')}
            />

            <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:bg-[var(--color-surface-2)] transition-colors" style={{ borderColor: 'var(--color-border)' }}>
              <input
                type="checkbox"
                checked={withImage}
                onChange={(e) => setWithImage(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-brand,#7c3aed)]"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--color-text)]">Also generate a matching image</span>
                <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
                  AI creates an image related to the post. Takes a few extra seconds; you can replace it in the editor.
                </span>
              </span>
            </label>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              leftIcon={<Sparkles size={16} />}
            >
              {isLoading
                ? (withImage ? 'Generating text & image...' : 'Generating...')
                : isEditMode
                  ? 'Regenerate this post'
                  : selectedPlatforms.length > 1
                    ? 'Generate for both platforms'
                    : 'Generate Content'}
            </Button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <div className="card min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Generated Content</h2>
              {activeDraft && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={copyToClipboard}
                    className="btn-ghost text-xs flex items-center gap-1"
                    title="Copy to clipboard"
                  >
                    <Copy size={13} /> Copy
                  </button>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="btn-ghost text-xs"
                  >
                    {isEditing ? 'Preview' : 'Edit'}
                  </button>
                </div>
              )}
            </div>

            {drafts.length > 1 && (
              <div className="grid grid-cols-2 gap-2 mb-4">
                {drafts.map((draft) => (
                  <button
                    key={draft.platform}
                    type="button"
                    onClick={() => {
                      setActivePlatform(draft.platform);
                      setIsEditing(false);
                    }}
                    className={clsx(
                      'flex items-center justify-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all',
                      activeDraft?.platform === draft.platform
                        ? 'border-brand-500/50 bg-brand-500/5 text-[var(--color-text)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                    )}
                  >
                    <PlatformIcon platform={draft.platform} size={14} />
                    {draft.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}
                  </button>
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-16 space-y-3"
                >
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full bg-brand-500/10 flex items-center justify-center">
                      <Sparkles size={20} className="text-brand-400 animate-pulse-slow" />
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {selectedPlatforms.length > 1
                      ? 'ChatGPT is writing a post for each selected platform...'
                      : 'ChatGPT is crafting your content...'}
                  </p>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-brand-400"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : activeDraft ? (
                <motion.div
                  key={activeDraft.platform}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="label flex items-center gap-1.5 text-brand-400 font-semibold text-xs tracking-wide uppercase">
                        <ImageIcon size={15} />
                        Post image
                      </p>
                    </div>
                    {activeDraft.content.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => setShowImagePreview(true)}
                        className="relative block w-full rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-xl text-left"
                        title="View full screen"
                      >
                        <img
                          src={activeDraft.content.imageUrl}
                          alt={activeDraft.content.imageAltText || 'Post image'}
                          className="w-full max-h-[460px] object-contain rounded-xl bg-[var(--color-surface-2)]"
                        />
                        <span className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <Maximize2 size={14} />
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-36 rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <UploadCloud size={20} />
                        <span className="text-xs">Upload a photo</span>
                      </button>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={isGeneratingImage}
                        onClick={() => void handleGenerateImage()}
                        leftIcon={<Sparkles size={13} />}
                      >
                        {activeDraft.content.imageUrl ? 'Regenerate image' : 'Generate image'}
                      </Button>
                      {activeDraft.content.imageUrl && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setShowImagePreview(true)}
                          leftIcon={<Maximize2 size={13} />}
                        >
                          Full screen
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        leftIcon={<UploadCloud size={13} />}
                      >
                        Upload
                      </Button>
                      {activeDraft.content.imageUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => applyDraftUpdate(activeDraft.platform, {
                            content: { ...activeDraft.content, imageUrl: '', imageAltText: '' },
                          })}
                          leftIcon={<Trash2 size={13} />}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadImage(file);
                        e.target.value = '';
                      }}
                    />
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 p-3.5 rounded-xl border border-brand-500/30 bg-brand-500/5">
                      <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
                        <span className="text-xs font-bold text-brand-400">Live Post Editor</span>
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditing(false);
                            toast.success('Post edits applied!');
                          }}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          Save Edits
                        </button>
                      </div>

                      <Textarea
                        label="Caption"
                        rows={6}
                        value={activeDraft.caption}
                        onChange={(e) => applyDraftUpdate(activeDraft.platform, { caption: e.target.value })}
                      />

                      <div>
                        <label className="label">Hashtags (comma separated)</label>
                        <input
                          type="text"
                          value={activeDraft.hashtags.join(', ')}
                          onChange={(e) => applyDraftUpdate(activeDraft.platform, {
                            hashtags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
                          })}
                          className="input w-full text-xs"
                          placeholder="tag1, tag2, tag3"
                        />
                      </div>

                      <div>
                        <label className="label">Call to Action</label>
                        <input
                          type="text"
                          value={activeDraft.cta}
                          onChange={(e) => applyDraftUpdate(activeDraft.platform, { cta: e.target.value })}
                          className="input w-full text-xs"
                          placeholder="Engaging closing CTA"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="label">Caption</p>
                        <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-line p-3 rounded-xl border border-[var(--color-border)]"
                           style={{ background: 'var(--color-surface-2)' }}>
                          {activeDraft.caption || activeDraft.content.caption}
                        </p>
                      </div>

                      {(activeDraft.hashtags.length > 0 ? activeDraft.hashtags : activeDraft.content.hashtags).length > 0 && (
                        <div>
                          <p className="label">Hashtags</p>
                          <div className="flex flex-wrap gap-2">
                            {(activeDraft.hashtags.length > 0 ? activeDraft.hashtags : activeDraft.content.hashtags).map((tag) => (
                              <span key={tag} className="badge badge-approved text-xs">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(activeDraft.cta || activeDraft.content.callToAction) && (
                        <div>
                          <p className="label">Call to Action</p>
                          <p className="text-sm text-[var(--color-text)] p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
                            {activeDraft.cta || activeDraft.content.callToAction}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {activeDraft.postId && (
                    <div className="flex items-center gap-2 text-xs text-success p-3 rounded-xl bg-success/5 border border-success/20">
                      <CheckCircle2 size={14} />
                      {drafts.length > 1
                        ? `${activeDraft.platform === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'} draft saved — switch tabs to review the other platform`
                        : 'Content saved as draft — ready for your review and approval'}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <div className="mb-3 rounded-2xl bg-brand-500/5 p-4 border border-dashed border-brand-500/20">
                    <Sparkles size={28} className="text-brand-500/40" />
                  </div>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Fill in your requirements and click Generate
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {activeDraft?.postId && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <Button
                variant="secondary"
                className="flex-1"
                onClick={copyToClipboard}
                leftIcon={<Copy size={14} />}
              >
                Copy Content
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={isEditMode ? () => void saveEdits() : goToApproval}
                rightIcon={<ArrowRight size={14} />}
                loading={isEditMode ? isSaving : false}
              >
                {isEditMode ? 'Save & review' : 'Review & Approve'}
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>

      <ImageLightbox
        src={activeDraft?.content.imageUrl ?? ''}
        alt={activeDraft?.content.imageAltText || 'Post image'}
        open={showImagePreview}
        onClose={() => setShowImagePreview(false)}
      />
    </div>
  );
}
