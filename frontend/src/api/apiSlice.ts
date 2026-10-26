import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../store';
import { clearCredentials } from '../store/slices/authSlice';
import type {
  ApiResponse, User, Post, ConnectedAccount, DashboardStats,
  Notification, GeneratedContent, GenerationRequest,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: BASE_URL,
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

/** Signs the user out locally as soon as the server says the token/session is no longer valid. */
const baseQueryWithAuthGuard: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  queryApi,
  extraOptions,
) => {
  const result = await rawBaseQuery(args, queryApi, extraOptions);
  const url = typeof args === 'string' ? args : args.url;
  const isCredentialCheck = url === '/auth/login' || url === '/auth/register' || url === '/auth/change-password';

  if (result.error?.status === 401 && !isCredentialCheck && (queryApi.getState() as RootState).auth.isAuthenticated) {
    queryApi.dispatch(clearCredentials());
  }
  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuthGuard,
    tagTypes: ['User', 'Posts', 'Post', 'Accounts', 'Dashboard', 'Notifications'],

  endpoints: (builder) => ({

    // ─── Auth ─────────────────────────────────────────────────────────────────
    register: builder.mutation<ApiResponse<{ token: string; user: User }>, { name: string; email: string; password: string }>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
    }),

    login: builder.mutation<ApiResponse<{ token: string; user: User }>, { email: string; password: string }>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
    }),

    logout: builder.mutation<ApiResponse<void>, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: ['User', 'Posts', 'Accounts', 'Dashboard'],
    }),

    getMe: builder.query<ApiResponse<User>, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
    }),

    updateProfile: builder.mutation<ApiResponse<User>, { name?: string; timezone?: string; avatarUrl?: string | null }>({
      query: (body) => ({ url: '/auth/profile', method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),

    changePassword: builder.mutation<ApiResponse<{ message: string }>, { currentPassword: string; newPassword: string }>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),

    // ─── Dashboard ────────────────────────────────────────────────────────────
    getDashboard: builder.query<ApiResponse<DashboardStats>, void>({
      query: () => '/dashboard/stats',
      providesTags: ['Dashboard'],
    }),

    // ─── Posts ────────────────────────────────────────────────────────────────
    getPosts: builder.query<ApiResponse<Post[]>, { status?: string; platform?: string; page?: number; limit?: number }>({
      query: (params) => ({ url: '/posts', params }),
      providesTags: ['Posts'],
    }),

    getPost: builder.query<ApiResponse<Post>, string>({
      query: (id) => `/posts/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Post', id }],
    }),

    createPost: builder.mutation<ApiResponse<Post>, { post: { platform: string; connectedAccountId?: string }; content: { caption: string; hashtags: string[]; callToAction?: string; imageUrl?: string; imageAltText?: string } }>({
      query: (body) => ({ url: '/posts', method: 'POST', body }),
      invalidatesTags: ['Posts', 'Dashboard'],
    }),

    updatePost: builder.mutation<ApiResponse<Post>, { id: string; content: { caption: string; hashtags: string[]; callToAction?: string; imageUrl?: string; imageAltText?: string } }>({
      query: ({ id, content }) => ({ url: `/posts/${id}/content`, method: 'PATCH', body: content }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Post', id }, 'Posts', 'Dashboard'],
    }),

    approvePost: builder.mutation<ApiResponse<unknown>, { postId: string; connectedAccountId: string }>({
      query: ({ postId, connectedAccountId }) => ({
        url: `/posts/${postId}/approve`,
        method: 'POST',
        body: { connectedAccountId },
      }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Post', id: postId }, 'Posts', 'Dashboard'],
    }),

    publishPost: builder.mutation<ApiResponse<{ platformPostId?: string; platformUrl?: string }>, string>({
      query: (postId) => ({ url: `/posts/${postId}/publish`, method: 'POST' }),
      invalidatesTags: (_result, _error, postId) => [{ type: 'Post', id: postId }, 'Posts', 'Dashboard'],
    }),

    schedulePost: builder.mutation<ApiResponse<Post>, { postId: string; scheduledAt: string }>({
      query: ({ postId, scheduledAt }) => ({
        url: `/posts/${postId}/schedule`,
        method: 'POST',
        body: { scheduledAt },
      }),
      invalidatesTags: (_result, _error, { postId }) => [{ type: 'Post', id: postId }, 'Posts', 'Dashboard'],
    }),

    generateDailyPost: builder.mutation<
      ApiResponse<{ postId: string | null; postIds?: string[]; count?: number; message: string }>,
      { topic: string; platforms: Array<'LINKEDIN' | 'INSTAGRAM'>; withImage?: boolean; scheduledTimes?: string[] }
    >({
      query: (body) => ({ url: '/posts/generate-daily', method: 'POST', body }),
      invalidatesTags: ['Posts', 'Dashboard', 'Notifications'],
    }),

    // ─── AI Generation ────────────────────────────────────────────────────────
    generateContent: builder.mutation<ApiResponse<{ content: GeneratedContent; postId: string; durationMs: number; imageWarning?: string }>, GenerationRequest>({
      query: (body) => ({ url: '/generate', method: 'POST', body }),
      invalidatesTags: ['Posts', 'Dashboard'],
    }),

    generateImage: builder.mutation<
      ApiResponse<{ imageUrl: string; imageAltText: string; durationMs: number }>,
      { caption: string; topic?: string; platform: 'LINKEDIN' | 'INSTAGRAM'; style?: string }
    >({
      query: (body) => ({ url: '/generate-image', method: 'POST', body }),
    }),

    // ─── Connected Accounts ───────────────────────────────────────────────────
    getAccounts: builder.query<ApiResponse<ConnectedAccount[]>, void>({
      query: () => '/accounts',
      providesTags: ['Accounts'],
    }),

    getLinkedInAuthUrl: builder.query<ApiResponse<{ url: string; state: string }>, void>({
      query: () => '/auth/linkedin',
    }),

    getInstagramAuthUrl: builder.query<ApiResponse<{ url: string; state: string }>, void>({
      query: () => '/auth/instagram',
    }),

    connectLinkedIn: builder.mutation<ApiResponse<unknown>, { code: string }>({
      query: (body) => ({ url: '/auth/linkedin/callback', method: 'POST', body }),
      invalidatesTags: ['Accounts', 'Dashboard'],
    }),

    connectInstagram: builder.mutation<ApiResponse<unknown>, { code: string }>({
      query: (body) => ({ url: '/auth/instagram/callback', method: 'POST', body }),
      invalidatesTags: ['Accounts', 'Dashboard'],
    }),

    disconnectAccount: builder.mutation<ApiResponse<void>, string>({
      query: (id) => ({ url: `/accounts/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Accounts', 'Dashboard'],
    }),

    // ─── Notifications ────────────────────────────────────────────────────────
    getNotifications: builder.query<ApiResponse<Notification[]>, void>({
      query: () => '/notifications',
      providesTags: ['Notifications'],
    }),

    markNotificationRead: builder.mutation<ApiResponse<void>, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useGetDashboardQuery,
  useGetPostsQuery,
  useGetPostQuery,
  useCreatePostMutation,
  useUpdatePostMutation,
  useApprovePostMutation,
  usePublishPostMutation,
  useSchedulePostMutation,
  useGenerateDailyPostMutation,
  useGenerateContentMutation,
  useGenerateImageMutation,
  useGetAccountsQuery,
  useLazyGetLinkedInAuthUrlQuery,
  useLazyGetInstagramAuthUrlQuery,
  useConnectLinkedInMutation,
  useConnectInstagramMutation,
  useDisconnectAccountMutation,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
} = api;
