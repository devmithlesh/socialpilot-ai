import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Sparkles, RefreshCw, Wand2, Minimize2, Maximize2, Hash,
  Megaphone, ChevronDown, ChevronUp, CheckCircle2,
  Copy, ArrowRight, Zap, Image as ImageIcon,
  UploadCloud, X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useGenerateContentMutation } from '../api/apiSlice';
import { Button, Textarea, Input, Select, PlatformIcon } from '../components/ui';
import type { GeneratedContent, SocialPlatform } from '../types';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const formSchema = z.object({
  topic: z.string().optional(),
  instructions: z.string().optional(),
  platform: z.enum(['LINKEDIN', 'INSTAGRAM']),
  targetAudience: z.string().optional(),
  tone: z.string().optional(),
  objective: z.string().optional(),
  contentLength: z.enum(['short', 'medium', 'long']).optional(),
  language: z.string().optional(),
  hashtagPreferences: z.string().optional(),
  ctaPreferences: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const TONE_OPTIONS = [
  { value: '', label: 'Select tone...' },
  { value: 'professional', label: 'Professional' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'educational', label: 'Educational' },
  { value: 'humorous', label: 'Humorous' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'casual', label: 'Casual' },
];

const OBJECTIVE_OPTIONS = [
  { value: '', label: 'Select objective...' },
  { value: 'brand_awareness', label: 'Brand Awareness' },
  { value: 'lead_generation', label: 'Lead Generation' },
  { value: 'engagement', label: 'Drive Engagement' },
  { value: 'education', label: 'Educate Audience' },
  { value: 'thought_leadership', label: 'Thought Leadership' },
  { value: 'product_launch', label: 'Product Launch' },
  { value: 'event_promotion', label: 'Event Promotion' },
];

const OPERATIONS = [
  { id: 'regenerate', label: 'Regenerate', icon: RefreshCw },
  { id: 'improve', label: 'Improve Writing', icon: Wand2 },
  { id: 'shorten', label: 'Make Shorter', icon: Minimize2 },
  { id: 'lengthen', label: 'Make Longer', icon: Maximize2 },
  { id: 'generate_hashtags', label: 'New Hashtags', icon: Hash },
  { id: 'improve_cta', label: 'Improve CTA', icon: Megaphone },
  { id: 'improve_hook', label: 'Improve Hook', icon: Zap },
];

export function AIStudioPage() {
  const navigate = useNavigate();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [savedPostId, setSavedPostId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [editedHashtags, setEditedHashtags] = useState<string[]>([]);
  const [editedCta, setEditedCta] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
    size: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [withImage, setWithImage] = useState(true);

  const [generate, { isLoading }] = useGenerateContentMutation();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { platform: 'LINKEDIN', contentLength: 'short' },
  });

  const platform = watch('platform') as SocialPlatform;

  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, WEBP)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setUploadedImage({
        base64,
        mimeType: file.type,
        name: file.name,
        size: file.size,
      });
      toast.success(`Image "${file.name}" uploaded! ChatGPT will analyze it.`);
    };
    reader.readAsDataURL(file);
  };

  const onGenerate = handleSubmit(async (values) => {
    if (!values.topic?.trim() && !uploadedImage) {
      toast.error('Please enter a topic or upload an image from your gallery.');
      return;
    }

    try {
      const result = await generate({
        ...values,
        topic: values.topic?.trim() || 'Uploaded visual breakdown and insights',
        imageBase64: uploadedImage?.base64,
        imageMimeType: uploadedImage?.mimeType,
        withImage: withImage && !uploadedImage,
        operation: 'generate',
      }).unwrap();

      if (result.success && result.data) {
        setGeneratedContent(result.data.content);
        setSavedPostId(result.data.postId);
        setEditedCaption(result.data.content.caption);
        setEditedHashtags(result.data.content.hashtags || []);
        setEditedCta(result.data.content.callToAction || '');
        setIsEditing(false);
        toast.success(uploadedImage ? 'Post generated from your uploaded image!' : 'Content generated and saved as draft');
        if (result.data.imageWarning) {
          toast.error('Post text is ready, but the image could not be generated. You can retry from the post editor.');
        }
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Failed to generate content');
    }
  });

  const onOperation = async (operation: string) => {
    const values = watch();
    try {
      const result = await generate({
        ...values,
        topic: values.topic?.trim() || 'Uploaded visual breakdown and insights',
        operation: operation as FormValues['platform'],
        existingContent: editedCaption || generatedContent?.caption,
        postId: savedPostId ?? undefined,
        imageBase64: uploadedImage?.base64,
        imageMimeType: uploadedImage?.mimeType,
        // Keep the AI-generated image when only the text is being reworked
        existingImageUrl: !uploadedImage ? generatedContent?.imageUrl ?? undefined : undefined,
      }).unwrap();

      if (result.success && result.data) {
        setGeneratedContent(result.data.content);
        setEditedCaption(result.data.content.caption);
        setEditedHashtags(result.data.content.hashtags || []);
        setEditedCta(result.data.content.callToAction || '');
        toast.success('Content updated');
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Operation failed');
    }
  };

  const copyToClipboard = async () => {
    const activeHashtags = editedHashtags.length > 0 ? editedHashtags : (generatedContent?.hashtags ?? []);
    const parts = [
      editedCaption || generatedContent?.caption,
      editedCta || generatedContent?.callToAction,
      activeHashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' '),
    ].filter(Boolean);
    await navigator.clipboard.writeText(parts.join('\n\n'));
    toast.success('Copied caption & hashtags to clipboard');
  };

  const goToApproval = () => {
    if (savedPostId) {
      navigate(`/posts/${savedPostId}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="page-title">AI Content Studio</h1>
        <p className="page-subtitle">
          Generate platform-optimized social media content powered by ChatGPT.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Input Panel */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="card space-y-4"
        >
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Content Requirements</h2>

          <form onSubmit={onGenerate} className="space-y-4" noValidate>
            {/* Platform selector */}
            <div>
              <label className="label">Platform</label>
              <div className="grid grid-cols-2 gap-2">
                {(['LINKEDIN', 'INSTAGRAM'] as const).map((p) => (
                  <label
                    key={p}
                    className={clsx(
                      'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                      platform === p
                        ? 'border-brand-500/50 bg-brand-500/5'
                        : 'border-[var(--color-border)] hover:border-[var(--color-text-subtle)]'
                    )}
                  >
                    <input type="radio" value={p} {...register('platform')} className="sr-only" />
                    <PlatformIcon platform={p} size={18} />
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      {p === 'LINKEDIN' ? 'LinkedIn' : 'Instagram'}
                    </span>
                    {platform === p && (
                      <CheckCircle2 size={14} className="ml-auto text-brand-400" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Gallery Image Uploader */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="label flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)]">
                  <UploadCloud size={14} className="text-brand-400" />
                  Upload Image from Gallery / Device
                </label>
                <span className="text-[11px] text-[var(--color-text-muted)]">Optional</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                }}
              />

              {!uploadedImage ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleImageSelect(file);
                  }}
                  className="border-2 border-dashed border-[var(--color-border)] hover:border-brand-500/50 rounded-xl p-3.5 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all hover:bg-[var(--color-surface-hover)] bg-[var(--color-surface-2)]/40 group"
                >
                  <div className="h-9 w-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400 group-hover:scale-105 transition-transform">
                    <ImageIcon size={18} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-semibold text-[var(--color-text)]">
                      Select or drop image from gallery
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      ChatGPT will analyze it and write a matching description
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative rounded-xl border border-brand-500/30 bg-brand-500/5 p-3 flex items-center gap-3">
                  <img
                    src={uploadedImage.base64}
                    alt="Uploaded thumbnail"
                    className="h-14 w-14 object-cover rounded-lg border border-[var(--color-border)] shadow-sm shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-400">
                      <Sparkles size={13} />
                      <span>ChatGPT ready</span>
                    </div>
                    <p className="text-xs font-medium text-[var(--color-text)] truncate mt-0.5">
                      {uploadedImage.name}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {(uploadedImage.size / 1024).toFixed(0)} KB • AI will write post based on this image
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadedImage(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-danger hover:bg-rose-500/10 transition-colors"
                    title="Remove image"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>

            <div>
              <Textarea
                label={uploadedImage ? "Topic or key angle (Optional)" : "Topic or search prompt *"}
                placeholder={uploadedImage ? "e.g. 'Focus on step 3' or leave blank for full auto analysis" : "Ask or search anything: e.g. 'Frontend Developer Roadmap', 'B2B SaaS Growth Playbook', 'Fitness in 90 Days', 'Crypto Investing for Beginners'..."}
                rows={3}
                error={errors.topic?.message}
                {...register('topic')}
              />
              {!uploadedImage && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-[var(--color-text-muted)] font-medium">Any topic works:</span>
                  {[
                    'Frontend Developer Roadmap',
                    'B2B SaaS Growth Playbook',
                    'Fitness & Fat Loss in 90 Days',
                    'Personal Finance Mastery',
                    'AI Prompt Engineering Guide',
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => setValue('topic', example)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] hover:bg-brand-500/15 hover:text-brand-400 border border-[var(--color-border)] transition-colors"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Textarea
              label="Specific instructions"
              placeholder="Any specific angles, key points, or style guidance..."
              rows={2}
              {...register('instructions')}
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Tone"
                options={TONE_OPTIONS}
                {...register('tone')}
              />
              <Select
                label="Objective"
                options={OBJECTIVE_OPTIONS}
                {...register('objective')}
              />
            </div>

            <Input
              label="Target audience"
              placeholder="e.g. 'SaaS founders, 5-50 employees'"
              {...register('targetAudience')}
            />

            {/* Advanced options */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Advanced options
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Caption length"
                      options={[{ value: 'short', label: '2 lines' }]}
                      {...register('contentLength')}
                    />
                    <Select
                      label="Language"
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'es', label: 'Spanish' },
                        { value: 'fr', label: 'French' },
                        { value: 'de', label: 'German' },
                        { value: 'pt', label: 'Portuguese' },
                        { value: 'hi', label: 'Hindi' },
                      ]}
                      {...register('language')}
                    />
                  </div>
                  <Input
                    label="Hashtag preferences"
                    placeholder="e.g. 'mix of niche and popular, no generic ones'"
                    {...register('hashtagPreferences')}
                  />
                  <Input
                    label="Call-to-action preferences"
                    placeholder="e.g. 'drive LinkedIn page follows'"
                    {...register('ctaPreferences')}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {!uploadedImage && (
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
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              leftIcon={<Sparkles size={16} />}
            >
              {isLoading ? (withImage && !uploadedImage ? 'Generating text & image...' : 'Generating...') : 'Generate Content'}
            </Button>
          </form>
        </motion.div>

        {/* Output Panel */}
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          {/* Generated content */}
          <div className="card min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Generated Content</h2>
              {generatedContent && (
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
                  <p className="text-sm text-[var(--color-text-muted)]">ChatGPT is crafting your content...</p>
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
              ) : generatedContent ? (
                <motion.div
                  key="content"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  {/* 1. Visual Section */}
                  {uploadedImage || (generatedContent.imageUrl && generatedContent.imageUrl.startsWith('data:image/')) ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="label flex items-center gap-1.5 text-brand-400 font-semibold text-xs tracking-wide uppercase">
                          <ImageIcon size={15} />
                          {uploadedImage ? 'Your Uploaded Image' : 'AI-Generated Image'}
                        </p>
                        <span className="text-xs text-brand-400 bg-brand-500/10 px-2.5 py-0.5 rounded-lg border border-brand-500/20 font-medium">
                          Active Visual
                        </span>
                      </div>
                      <div className="relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-2)] shadow-xl group">
                        <img
                          src={uploadedImage?.base64 || generatedContent.imageUrl!}
                          alt={generatedContent.imageAltText || 'User uploaded visual'}
                          className="w-full max-h-[460px] object-contain rounded-xl bg-[var(--color-surface-2)]"
                        />
                        {generatedContent.imageAltText && (
                          <div className="p-3 bg-[var(--color-surface-2)] border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                            💡 <span className="font-semibold text-[var(--color-text)]">Image description:</span> {generatedContent.imageAltText}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* 2. Short & Punchy Caption & Post Details */}
                  {isEditing ? (
                    <div className="space-y-3 p-3.5 rounded-xl border border-brand-500/30 bg-brand-500/5">
                      <div className="flex items-center justify-between pb-1 border-b border-[var(--color-border)]">
                        <span className="text-xs font-bold text-brand-400">✏️ Live Post Editor</span>
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
                        value={editedCaption}
                        onChange={(e) => setEditedCaption(e.target.value)}
                      />

                      <div>
                        <label className="label">Hashtags (comma separated)</label>
                        <input
                          type="text"
                          value={editedHashtags.join(', ')}
                          onChange={(e) => setEditedHashtags(e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))}
                          className="input w-full text-xs"
                          placeholder="tag1, tag2, tag3"
                        />
                      </div>

                      <div>
                        <label className="label">Call to Action</label>
                        <input
                          type="text"
                          value={editedCta}
                          onChange={(e) => setEditedCta(e.target.value)}
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
                          {editedCaption || generatedContent.caption}
                        </p>
                      </div>

                      {/* Hashtags */}
                      {(editedHashtags.length > 0 ? editedHashtags : generatedContent.hashtags).length > 0 && (
                        <div>
                          <p className="label">Hashtags</p>
                          <div className="flex flex-wrap gap-2">
                            {(editedHashtags.length > 0 ? editedHashtags : generatedContent.hashtags).map((tag) => (
                              <span key={tag} className="badge badge-approved text-xs">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CTA */}
                      {(editedCta || generatedContent.callToAction) && (
                        <div>
                          <p className="label">Call to Action</p>
                          <p className="text-sm text-[var(--color-text)] p-3 rounded-xl border" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
                            {editedCta || generatedContent.callToAction}
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {/* Draft notice */}
                  {savedPostId && (
                    <div className="flex items-center gap-2 text-xs text-success p-3 rounded-xl bg-success/5 border border-success/20">
                      <CheckCircle2 size={14} />
                      Content saved as draft — ready for your review and approval
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

          {/* Quick operations */}
          {generatedContent && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <p className="text-xs font-medium text-[var(--color-text-muted)] mb-3">Quick operations</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {OPERATIONS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => onOperation(id)}
                    disabled={isLoading}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-brand-500/30 transition-all disabled:opacity-50"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Action buttons */}
          {savedPostId && (
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
                onClick={goToApproval}
                rightIcon={<ArrowRight size={14} />}
              >
                Review & Approve
              </Button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
