import { lazy, Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { store } from './store';
import { AppLayout } from './components/layout/AppLayout';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { Spinner } from './components/ui';
import { useAppSelector, useAppDispatch } from './store';
import { setInitialized } from './store/slices/authSlice';
import { useGetMeQuery } from './api/apiSlice';
import { updateUser } from './store/slices/authSlice';

// Lazy-loaded pages for code splitting
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const AIStudioPage = lazy(() => import('./pages/AIStudioPage').then((m) => ({ default: m.AIStudioPage })));
const PostDetailPage = lazy(() => import('./pages/PostDetailPage').then((m) => ({ default: m.PostDetailPage })));
const ApprovalQueuePage = lazy(() => import('./pages/ApprovalQueuePage').then((m) => ({ default: m.ApprovalQueuePage })));
const PublishedPostsPage = lazy(() => import('./pages/PublishedPostsPage').then((m) => ({ default: m.PublishedPostsPage })));
const ConnectedAccountsPage = lazy(() => import('./pages/ConnectedAccountsPage').then((m) => ({ default: m.ConnectedAccountsPage })));
const BrandSettingsPage = lazy(() => import('./pages/BrandSettingsPage').then((m) => ({ default: m.BrandSettingsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage').then((m) => ({ default: m.OAuthCallbackPage })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <Spinner size="lg" />
    </div>
  );
}

/**
 * Route guard — redirects unauthenticated users to login.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

/**
 * App initializer — validates existing JWT against server on startup.
 */
function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const { data, isLoading } = useGetMeQuery(undefined, { skip: !token });

  useEffect(() => {
    if (!isLoading) {
      if (data?.success && data.data) {
        dispatch(updateUser(data.data));
      }
      dispatch(setInitialized());
    }
  }, [isLoading, data, dispatch]);

  if (isLoading && token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm text-[var(--color-text-muted)]">Loading SocialPilot AI...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginForm />,
  },
  {
    path: '/register',
    element: <RegisterForm />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<PageLoader />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: 'create',
        element: (
          <Suspense fallback={<PageLoader />}>
            <AIStudioPage />
          </Suspense>
        ),
      },
      // Legacy URL: the AI studio and "Create Post" are the same page
      { path: 'studio', element: <Navigate to="/create" replace /> },
      {
        path: 'posts/:postId',
        element: (
          <Suspense fallback={<PageLoader />}>
            <PostDetailPage />
          </Suspense>
        ),
      },
      {
        path: 'approvals',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ApprovalQueuePage />
          </Suspense>
        ),
      },
      {
        path: 'published',
        element: (
          <Suspense fallback={<PageLoader />}>
            <PublishedPostsPage />
          </Suspense>
        ),
      },
      {
        path: 'accounts',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ConnectedAccountsPage />
          </Suspense>
        ),
      },
      {
        path: 'oauth/:platform/callback',
        element: (
          <Suspense fallback={<PageLoader />}>
            <OAuthCallbackPage />
          </Suspense>
        ),
      },
      {
        path: 'brand',
        element: (
          <Suspense fallback={<PageLoader />}>
            <BrandSettingsPage />
          </Suspense>
        ),
      },
      {
        path: 'profile',
        element: (
          <Suspense fallback={<PageLoader />}>
            <ProfilePage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: '*',
    element: (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--color-bg)' }}>
        <p className="text-6xl font-bold text-gradient">404</p>
        <p className="text-[var(--color-text-muted)]">Page not found</p>
        <a href="/dashboard" className="btn-primary btn">Go to dashboard</a>
      </div>
    ),
  },
]);

export function App() {
  return (
    <Provider store={store}>
      <AppInitializer>
        <RouterProvider router={router} />
      </AppInitializer>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: 'white' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: 'white' },
          },
        }}
      />
    </Provider>
  );
}

export default App;
