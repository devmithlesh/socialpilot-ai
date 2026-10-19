import { motion } from 'framer-motion';
import {
  useGetAccountsQuery,
  useDisconnectAccountMutation,
  useLazyGetLinkedInAuthUrlQuery,
  useLazyGetInstagramAuthUrlQuery,
} from '../api/apiSlice';
import { Button, PlatformIcon } from '../components/ui';
import { Link2, Trash2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

type Platform = 'LINKEDIN' | 'INSTAGRAM';

const PLATFORMS: ReadonlyArray<{ id: Platform; name: string; description: string }> = [
  {
    id: 'LINKEDIN',
    name: 'LinkedIn',
    description: 'Publish approved text posts to your LinkedIn profile.',
  },
  {
    id: 'INSTAGRAM',
    name: 'Instagram',
    description: 'Publish approved image posts to an Instagram professional account.',
  },
];

export function ConnectedAccountsPage() {
  const { data } = useGetAccountsQuery();
  const [disconnect, { isLoading: isDisconnecting }] = useDisconnectAccountMutation();
  const [getLinkedInUrl, { isFetching: isGettingLinkedInUrl }] = useLazyGetLinkedInAuthUrlQuery();
  const [getInstagramUrl, { isFetching: isGettingInstagramUrl }] = useLazyGetInstagramAuthUrlQuery();

  const accounts = data?.data ?? [];

  // Redirects to the platform's official OAuth screen. The backend refuses with
  // NOT_CONFIGURED when client credentials are missing, which we surface verbatim.
  const handleConnect = async (platform: Platform) => {
    try {
      const result = platform === 'LINKEDIN'
        ? await getLinkedInUrl().unwrap()
        : await getInstagramUrl().unwrap();

      if (result.success && result.data?.url) {
        sessionStorage.setItem('oauth_state', result.data.state);
        window.location.href = result.data.url;
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error.data?.error?.message ?? 'Could not start the connection flow');
    }
  };

  const handleDisconnect = async (accountId: string, displayName: string) => {
    if (!window.confirm(`Disconnect ${displayName}?`)) return;
    try {
      await disconnect(accountId).unwrap();
      toast.success('Account disconnected');
    } catch {
      toast.error('Failed to disconnect account');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="page-title">Connected Accounts</h1>
        <p className="page-subtitle">
          Connect your social accounts through the official login screen. Posts are only published to these accounts after your approval.
        </p>
      </div>

      <div className="space-y-4">
        {PLATFORMS.map(({ id, name, description }) => {
          const connected = accounts.filter((a) => a.platform === id);
          const isLoadingUrl = id === 'LINKEDIN' ? isGettingLinkedInUrl : isGettingInstagramUrl;

          return (
            <motion.div
              key={id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="card space-y-4"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 mt-1">
                  <PlatformIcon platform={id} size={36} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-[var(--color-text)]">{name}</h2>
                        {connected.length > 0 && (
                          <span className="badge badge-approved text-[10px]">{connected.length} linked</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">{description}</p>
                    </div>

                    <Button
                      variant="primary"
                      size="sm"
                      loading={isLoadingUrl}
                      onClick={() => handleConnect(id)}
                      leftIcon={<Link2 size={14} />}
                    >
                      Connect {name}
                    </Button>
                  </div>

                  {connected.length > 0 && (
                    <ul className="mt-4 space-y-2.5">
                      {connected.map((account) => (
                        <li
                          key={account.id}
                          className="flex items-center gap-3 p-3 rounded-xl border"
                          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
                        >
                          {account.platformAvatarUrl ? (
                            <img
                              src={account.platformAvatarUrl}
                              alt=""
                              className="h-9 w-9 rounded-full bg-[var(--color-surface-2)]"
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-brand-600 flex items-center justify-center text-xs text-white font-semibold">
                              {account.platformDisplayName[0]}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-[var(--color-text)] truncate">
                                {account.platformDisplayName}
                              </p>
                              <span className="text-[10px] font-semibold bg-success/15 text-success px-2 py-0.5 rounded-full border border-success/30 flex items-center gap-1">
                                <CheckCircle size={10} aria-hidden="true" /> Connected
                              </span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
                              {account.platformUsername}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDisconnect(account.id, account.platformDisplayName)}
                            disabled={isDisconnecting}
                            className="btn-icon text-[var(--color-text-muted)] hover:text-danger transition-colors p-2"
                            aria-label={`Disconnect ${account.platformDisplayName}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
