import { useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useConnectLinkedInMutation, useConnectInstagramMutation } from '../api/apiSlice';
import { Spinner } from '../components/ui';
import toast from 'react-hot-toast';

export function OAuthCallbackPage() {
  const { platform } = useParams<{ platform: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [connectLinkedIn] = useConnectLinkedInMutation();
  const [connectInstagram] = useConnectInstagramMutation();

  // OAuth codes are single-use. StrictMode runs effects twice in development,
  // so guard against exchanging the same code a second time.
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    if (error) {
      toast.error(`Authentication cancelled or failed: ${errorDescription || error}`);
      navigate('/accounts');
      return;
    }

    if (!code) {
      toast.error('No authorization code received from provider');
      navigate('/accounts');
      return;
    }

    const processOAuth = async () => {
      try {
        if (platform === 'linkedin') {
          await connectLinkedIn({ code }).unwrap();
          toast.success('LinkedIn account successfully connected!');
        } else if (platform === 'instagram') {
          await connectInstagram({ code }).unwrap();
          toast.success('Instagram account successfully connected!');
        } else {
          toast.error('Unknown OAuth platform');
        }
      } catch (err: unknown) {
        const errObj = err as { data?: { error?: { message?: string } } };
        toast.error(errObj.data?.error?.message || 'Failed to complete account connection');
      } finally {
        navigate('/accounts');
      }
    };

    processOAuth();
  }, [platform, searchParams, connectLinkedIn, connectInstagram, navigate]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
      <Spinner size="lg" />
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text)]">
          Connecting your {platform === 'linkedin' ? 'LinkedIn' : 'Instagram'} account...
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          Securing authentication tokens and establishing permissions.
        </p>
      </div>
    </div>
  );
}
