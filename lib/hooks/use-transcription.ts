import { useState, useCallback } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

export interface TranscriptionUsage {
  subscriptionMinutes: {
    used: number;
    limit: number;
    remaining: number;
  };
  topupMinutes: number;
  totalRemaining: number;
  resetAt?: string;
  isUnlimited?: boolean;
}

interface UseTranscriptionReturn {
  usage: TranscriptionUsage | null;
  isLoading: boolean;
  error: string | null;
  fetchUsage: () => Promise<TranscriptionUsage | null>;
  startTranscription: (youtubeId: string, durationSeconds: number) => Promise<{ jobId: string } | null>;
  cancelTranscription: (jobId: string) => Promise<boolean>;
}

export function useTranscription(): UseTranscriptionReturn {
  const [usage, setUsage] = useState<TranscriptionUsage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (): Promise<TranscriptionUsage | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/transcription-usage');

      if (!response.ok) {
        if (response.status === 401) {
          setError('Please sign in to use AI transcription');
          return null;
        }
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch transcription usage');
      }

      const data = await response.json();
      const usagePayload = data?.usage ?? data;

      if (!usagePayload) {
        setUsage(null);
        return null;
      }

      const usageData: TranscriptionUsage = {
        subscriptionMinutes: {
          used: usagePayload.subscriptionMinutes?.used ?? 0,
          limit: usagePayload.subscriptionMinutes?.limit ?? 0,
          remaining: usagePayload.subscriptionMinutes?.remaining ?? 0,
        },
        topupMinutes: usagePayload.topupMinutes ?? 0,
        totalRemaining: usagePayload.totalRemaining ?? 0,
        resetAt: usagePayload.resetAt,
        isUnlimited: usagePayload.isUnlimited ?? data?.isUnlimited ?? false,
      };

      setUsage(usageData);
      return usageData;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch usage';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startTranscription = useCallback(async (
    youtubeId: string,
    durationSeconds: number
  ): Promise<{ jobId: string } | null> => {
    setError(null);

    try {
      const response = await csrfFetch.post('/api/transcribe', {
        youtubeId,
        durationSeconds,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Please sign in to use AI transcription');
        }
        if (response.status === 403) {
          throw new Error(data.error || 'AI transcription is only available for Pro subscribers');
        }
        throw new Error(data.error || 'Failed to start transcription');
      }

      // Refresh usage after starting
      fetchUsage();

      return { jobId: data.jobId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start transcription';
      setError(message);
      return null;
    }
  }, [fetchUsage]);

  const cancelTranscription = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const response = await csrfFetch.post('/api/transcribe/cancel', { jobId });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel transcription');
      }

      // Refresh usage after cancelling (refund may have occurred)
      fetchUsage();
      return true;
    } catch (err) {
      console.error('Failed to cancel transcription:', err);
      return false;
    }
  }, [fetchUsage]);

  return {
    usage,
    isLoading,
    error,
    fetchUsage,
    startTranscription,
    cancelTranscription,
  };
}
