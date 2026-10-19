import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { LogOut, Moon, Sun, Save, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useAppDispatch, useAppSelector } from '../store';
import { setTheme } from '../store/slices/uiSlice';
import { clearCredentials, updateUser } from '../store/slices/authSlice';
import {
  useChangePasswordMutation,
  useLogoutMutation,
  useUpdateProfileMutation,
} from '../api/apiSlice';
import { Avatar, Button, Input, Select } from '../components/ui';

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

  const timezones = useMemo(() => getTimezones(user?.timezone ?? 'UTC'), [user?.timezone]);

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', timezone: user?.timezone ?? 'UTC' },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

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
        <div className="flex items-center gap-4 mb-6">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="text-base font-semibold text-[var(--color-text)] truncate">{user.name}</p>
            <p className="text-sm text-[var(--color-text-muted)] truncate">{user.email}</p>
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              Member since {format(new Date(user.createdAt), 'MMMM yyyy')}
            </p>
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
            <Select label="Timezone" options={timezones} {...profileForm.register('timezone')} />
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
