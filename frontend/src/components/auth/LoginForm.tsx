import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Zap, ArrowRight } from 'lucide-react';
import { useLoginMutation } from '../../api/apiSlice';
import { useAppDispatch } from '../../store';
import { setCredentials } from '../../store/slices/authSlice';
import { Button, Input } from '../ui';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [loginMutation, { isLoading }] = useLoginMutation();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const result = await loginMutation(values).unwrap();
      if (result.success && result.data) {
        dispatch(setCredentials(result.data));
        navigate('/dashboard');
        toast.success(`Welcome back, ${result.data.user.name.split(' ')[0]}!`);
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Login failed. Check your credentials.');
    }
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/4 w-96 h-96 bg-brand-700/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -right-1/4 w-80 h-80 bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md relative"
      >
        {/* Logo */}
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
          <p className="text-sm text-[var(--color-text-muted)] mt-1">Premium AI Social Media Management</p>
        </div>

        {/* Card */}
        <div className="card-glass p-8">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Welcome back</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Sign in to your account</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Input
              label="Email"
              type="email"
              id="login-email"
              placeholder="you@company.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              id="login-password"
              placeholder="Your password"
              autoComplete="current-password"
              error={errors.password?.message}
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

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={isLoading}
              rightIcon={<ArrowRight size={16} />}
            >
              Sign in
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">
              Create one free
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
