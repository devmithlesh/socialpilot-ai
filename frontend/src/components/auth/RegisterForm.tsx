import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Zap, ArrowRight, User, Mail, Lock } from 'lucide-react';
import { useRegisterMutation } from '../../api/apiSlice';
import { useAppDispatch } from '../../store';
import { setCredentials } from '../../store/slices/authSlice';
import { Button, Input } from '../ui';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [registerMutation, { isLoading }] = useRegisterMutation();

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await registerMutation({
        name: values.name,
        email: values.email,
        password: values.password,
      }).unwrap();

      if (result.success && result.data) {
        dispatch(setCredentials(result.data));
        navigate('/dashboard');
        toast.success(`Welcome to SocialPilot AI, ${result.data.user.name.split(' ')[0]}!`);
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Registration failed. Please try again.');
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-brand-700/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center justify-center rounded-2xl bg-brand-600 p-3 mb-4"
          >
            <Zap size={28} className="text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold text-gradient-strong">SocialPilot AI</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Start managing your social media with AI</p>
        </div>

        <div className="card-glass p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Create your account</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Free to start · No credit card required</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Input
              label="Full name"
              type="text"
              id="register-name"
              placeholder="Alex Johnson"
              autoComplete="name"
              error={errors.name?.message}
              leftIcon={<User size={15} />}
              {...register('name')}
            />

            <Input
              label="Email"
              type="email"
              id="register-email"
              placeholder="you@company.com"
              autoComplete="email"
              error={errors.email?.message}
              leftIcon={<Mail size={15} />}
              {...register('email')}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="register-password"
              placeholder="Min. 8 characters"
              autoComplete="new-password"
              error={errors.password?.message}
              leftIcon={<Lock size={15} />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              {...register('password')}
            />

            <Input
              label="Confirm password"
              type="password"
              id="register-confirm-password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
              leftIcon={<Lock size={15} />}
              {...register('confirmPassword')}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              rightIcon={<ArrowRight size={16} />}
            >
              Create account
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
            Already have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
