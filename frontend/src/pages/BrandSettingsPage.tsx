import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useGetBrandSettingsQuery, useUpdateBrandSettingsMutation } from '../api/apiSlice';
import { Button, Input, Textarea, Skeleton } from '../components/ui';
import toast from 'react-hot-toast';

const brandSchema = z.object({
  brandName: z.string().optional(),
  brandVoice: z.string().optional(),
  targetAudience: z.string().optional(),
  guidelines: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().or(z.literal('')),
  keywordsText: z.string().optional(), // comma-separated in the UI, stored as string[]
  dailyPostEnabled: z.boolean(),
});

type BrandForm = z.infer<typeof brandSchema>;

export function BrandSettingsPage() {
  const { data, isLoading } = useGetBrandSettingsQuery();
  const [updateSettings, { isLoading: isSaving }] = useUpdateBrandSettingsMutation();
  const settings = data?.data;

  const { register, handleSubmit, formState: { errors } } = useForm<BrandForm>({
    resolver: zodResolver(brandSchema),
    values: {
      brandName: settings?.brandName ?? '',
      brandVoice: settings?.brandVoice ?? '',
      targetAudience: settings?.targetAudience ?? '',
      guidelines: settings?.guidelines ?? '',
      primaryColor: settings?.primaryColor ?? '',
      keywordsText: settings?.keywords?.join(', ') ?? '',
      dailyPostEnabled: settings?.dailyPostEnabled ?? false,
    },
  });

  const onSubmit = handleSubmit(async ({ keywordsText, ...values }) => {
    try {
      const keywords = (keywordsText ?? '').split(',').map((k) => k.trim()).filter(Boolean);
      await updateSettings({ ...values, keywords }).unwrap();
      toast.success('Brand settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Brand Settings</h1>
        <p className="page-subtitle">
          Configure your brand voice and guidelines. These are used automatically during AI content generation.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Brand Identity</h2>

          <Input
            label="Brand name"
            placeholder="Your Company Inc."
            error={errors.brandName?.message}
            {...register('brandName')}
          />

          <div>
            <Input
              label="Primary brand color"
              type="color"
              className="h-10 cursor-pointer"
              {...register('primaryColor')}
            />
            <p className="text-xs text-[var(--color-text-subtle)] mt-1">Used for visual reference</p>
          </div>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Voice & Audience</h2>

          <Textarea
            label="Brand voice"
            placeholder="Describe your brand's personality and communication style. e.g. 'Professional yet approachable, data-driven, avoids jargon, uses storytelling...'"
            rows={4}
            hint="AI will use this to match your brand's tone in all generated content."
            {...register('brandVoice')}
          />

          <Textarea
            label="Target audience"
            placeholder="Describe your typical audience. e.g. 'B2B SaaS decision-makers, CTOs and engineering managers at companies with 50-500 employees...'"
            rows={3}
            {...register('targetAudience')}
          />
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Content Guidelines</h2>

          <Textarea
            label="Brand guidelines"
            placeholder="Any topics to avoid, required disclaimers, formatting preferences, competitor mentions policy, etc."
            rows={5}
            {...register('guidelines')}
          />
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Daily Post</h2>

          <div>
            <Input
              label="Topics / keywords"
              placeholder="react, web performance, career growth"
              {...register('keywordsText')}
            />
            <p className="text-xs text-[var(--color-text-subtle)] mt-1">
              Comma-separated. Daily drafts are written about one of these topics.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--color-brand,#7c3aed)]"
              {...register('dailyPostEnabled')}
            />
            <span>
              <span className="block text-sm font-medium text-[var(--color-text)]">
                Generate one LinkedIn draft every day
              </span>
              <span className="block text-xs text-[var(--color-text-muted)] mt-0.5">
                Drafts appear in your Approval Queue. Nothing is ever published until you approve it.
              </span>
            </span>
          </label>
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={isSaving}
          leftIcon={<Save size={16} />}
        >
          Save Brand Settings
        </Button>
      </form>
    </div>
  );
}
