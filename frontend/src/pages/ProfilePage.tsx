import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { LogOut, Moon, Sun, Save, KeyRound, Camera, Trash2, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useAppDispatch, useAppSelector } from '../store';
import { setTheme } from '../store/slices/uiSlice';
import { clearCredentials, updateUser } from '../store/slices/authSlice';
import {
  useChangePasswordMutation,
  useConnectTelegramMutation,
  useDisconnectTelegramMutation,
  useGetTelegramStatusQuery,
  useLogoutMutation,
  useUpdateProfileMutation,
} from '../api/apiSlice';
import { Button, Combobox, Input } from '../components/ui';

type ApiError = { data?: { error?: { message?: string } } };
const errorMessage = (err: unknown, fallback: string) => (err as ApiError).data?.error?.message ?? fallback;

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  timezone: z.string().min(1),
});
type ProfileForm = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
type PasswordForm = z.infer<typeof passwordSchema>;

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{description}</p>
    </div>
  );
}

const AVATAR_SIZE = 256;
const MAX_AVATAR_FILE_BYTES = 8 * 1024 * 1024;

/** Center-crops to a square and downsizes so the stored avatar stays around 20-40 KB. */
function resizeToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas is not supported'));
        return;
      }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image'));
    };
    img.src = objectUrl;
  });
}

function getTimezones(current: string): { value: string; label: string }[] {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const zones = new Set<string>(['UTC', ...supported]);
  zones.add(current);
  return [...zones].sort().map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}

export function ProfilePage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const theme = useAppSelector((s) => s.ui.theme);

  const [updateProfile, { isLoading: isSavingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();
  const { data: telegramRes, refetch: refetchTelegram } = useGetTelegramStatusQuery();
  const [connectTelegram, { isLoading: isConnectingTelegram }] = useConnectTelegramMutation();
  const [disconnectTelegram, { isLoading: isDisconnectingTelegram }] = useDisconnectTelegramMutation();
  const [awaitingTelegram, setAwaitingTelegram] = useState(false);
  const telegram = telegramRes?.data;

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const timezones = useMemo(() => getTimezones(user?.timezone ?? 'UTC'), [user?.timezone]);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', timezone: user?.timezone ?? 'UTC' },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (!awaitingTelegram) return;
    const id = window.setInterval(() => { void refetchTelegram(); }, 3000);
    return () => window.clearInterval(id);
  }, [awaitingTelegram, refetchTelegram]);

  useEffect(() => {
    if (telegram?.connected) setAwaitingTelegram(false);
  }, [telegram?.connected]);

  if (!user) return null;

  const onSaveProfile = profileForm.handleSubmit(async (values) => {
    try {
      const res = await updateProfile(values).unwrap();
      if (res.data) dispatch(updateUser({ ...user, ...res.data }));
      toast.success('Profile updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update profile'));
    }
  });

  const onChangePassword = passwordForm.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      passwordForm.reset();
      toast.success('Password updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change password'));
    }
  });

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      toast.error('Please choose a PNG, JPG or WebP image');
      return;
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      toast.error('Image must be smaller than 8 MB');
      return;
    }

    try {
      const avatarUrl = await resizeToAvatar(file);
      const res = await updateProfile({ avatarUrl }).unwrap();
      if (res.data) dispatch(updateUser({ ...user, ...res.data }));
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update profile photo'));
    }
  };

  const handleAvatarRemove = async () => {
    try {
      const res = await updateProfile({ avatarUrl: null }).unwrap();
      if (res.data) dispatch(updateUser({ ...user, ...res.data }));
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove profile photo'));
    }
  };

  const handleConnectTelegram = async () => {
    try {
      const res = await connectTelegram().unwrap();
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener');
        setAwaitingTelegram(true);
        toast.success('Open Telegram and tap Start');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not start Telegram connect'));
    }
  };

  const handleDisconnectTelegram = async () => {
    try {
      await disconnectTelegram().unwrap();
      setAwaitingTelegram(false);
      toast.success('Telegram disconnected');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not disconnect Telegram'));
    }
  };

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch {
      // Clear local state even if the server request fails
    }
    dispatch(clearCredentials());
    navigate('/login');
  };

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
  ];

  return (
    <div className=" mx-auto space-y-6">
      <div>
        <h1 className="page-title">Profile & Settings</h1>
        <p className="page-subtitle">Manage your account, appearance and security.</p>
      </div>

      {/* Profile */}
      <section className="card">
        <div className="flex items-center gap-5 mb-6">
          <div className="relative flex-shrink-0">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={`${user.name}'s profile photo`}
                className="h-20 w-20 rounded-full object-cover border"
                style={{ borderColor: 'var(--color-border)' }}
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-brand-600 text-white text-2xl font-semibold flex items-center justify-center" aria-hidden="true">
                {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-[var(--color-text)] truncate">{user.name}</p>
            <p className="text-sm text-[var(--color-text-muted)] truncate">{user.email}</p>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              Member since {format(new Date(user.createdAt), 'MMMM yyyy')}
            </p>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleAvatarSelected}
            />
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                loading={isSavingProfile}
                leftIcon={<Camera size={14} />}
                onClick={() => avatarInputRef.current?.click()}
              >
                {user.avatarUrl ? 'Change photo' : 'Upload photo'}
              </Button>
              {user.avatarUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isSavingProfile}
                  leftIcon={<Trash2 size={14} />}
                  onClick={handleAvatarRemove}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <form onSubmit={onSaveProfile} className="space-y-4" noValidate>
          <Input
            label="Full name"
            autoComplete="name"
            error={profileForm.formState.errors.name?.message}
            {...profileForm.register('name')}
          />
          <div>
            <Input label="Email" type="email" value={user.email} readOnly disabled />
            <p className="text-xs text-[var(--color-text-subtle)] mt-1.5">Your email is used to sign in and cannot be changed.</p>
          </div>
          <div>
            <Controller
              control={profileForm.control}
              name="timezone"
              render={({ field }) => (
                <Combobox
                  label="Timezone"
                  options={timezones}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Search city or region, e.g. Kolkata"
                />
              )}
            />
            <p className="text-xs text-[var(--color-text-subtle)] mt-1.5">
              Used for scheduling and the daily automated post.
            </p>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              variant="primary"
              loading={isSavingProfile}
              disabled={!profileForm.formState.isDirty}
              leftIcon={<Save size={15} />}
            >
              Save changes
            </Button>
          </div>
        </form>
      </section>

      {/* Appearance */}
      <section className="card">
        <SectionHeader title="Appearance" description="Choose how SocialPilot AI looks on this device." />
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Theme">
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => dispatch(setTheme(value))}
                className={clsx(
                  'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                  selected
                    ? 'border-brand-500 bg-brand-500/10 text-[var(--color-text)]'
                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
                )}
                style={selected ? undefined : { borderColor: 'var(--color-border)' }}
              >
                <Icon size={16} />
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Telegram review */}
      <section className="card">
        <SectionHeader
          title="Telegram review"
          description="Get each daily draft in Telegram. Approve publishes it to LinkedIn (or Instagram if that is the draft)."
        />
        {telegram?.connected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Connected{telegram.telegramUsername ? ` as @${telegram.telegramUsername}` : ''}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  New drafts from Approval Queue will also arrive in Telegram.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              loading={isDisconnectingTelegram}
              onClick={() => void handleDisconnectTelegram()}
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              {telegram?.configured
                ? awaitingTelegram
                  ? 'Waiting for you to tap Start in Telegram…'
                  : 'Connect once, then approve drafts from your phone.'
                : 'Add TELEGRAM_BOT_TOKEN to backend/.env (create a free bot with @BotFather), then restart the backend.'}
            </p>
            <Button
              variant="primary"
              size="sm"
              disabled={!telegram?.configured}
              loading={isConnectingTelegram}
              leftIcon={<MessageCircle size={15} />}
              onClick={() => void handleConnectTelegram()}
            >
              Connect Telegram
            </Button>
          </div>
        )}
      </section>

      {/* Security */}
      <section className="card">
        <SectionHeader
          title="Change password"
          description="Changing your password signs you out of all other devices."
        />
        <form onSubmit={onChangePassword} className="space-y-4" noValidate>
          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={passwordForm.formState.errors.currentPassword?.message}
            {...passwordForm.register('currentPassword')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register('newPassword')}
            />
            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register('confirmPassword')}
            />
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary" loading={isChangingPassword} leftIcon={<KeyRound size={15} />}>
              Update password
            </Button>
          </div>
        </form>
      </section>

      {/* Session */}
      <section className="card flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Sign out</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">End your session on this device.</p>
        </div>
        <Button variant="danger" onClick={handleLogout} loading={isLoggingOut} leftIcon={<LogOut size={15} />}>
          Sign out
        </Button>
      </section>
    </div>
  );
}
