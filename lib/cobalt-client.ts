/**
 * Cobalt API Client for YouTube Audio Extraction
 *
 * Cobalt (cobalt.tools) is a free, open-source media downloader API
 * that supports YouTube audio extraction.
 *
 * IMPORTANT: You must self-host a Cobalt instance for this to work.
 * The public api.cobalt.tools uses bot protection and is not for third-party use.
 *
 * Deployment: https://github.com/imputnet/cobalt
 */

const COBALT_API_URL = process.env.COBALT_API_URL;

export interface AudioExtractionResult {
  audioBuffer: ArrayBuffer;
  filename: string;
  contentType: string;
  size: number;
}

export interface AudioUrlResult {
  url: string;
  filename: string;
  type: 'tunnel' | 'redirect' | 'picker';
}

interface CobaltRequest {
  url: string;
  downloadMode?: 'auto' | 'audio' | 'mute';
  audioFormat?: 'best' | 'mp3' | 'ogg' | 'wav' | 'opus';
  audioBitrate?: '320' | '256' | '128' | '96' | '64' | '8';
  filenameStyle?: 'classic' | 'pretty' | 'basic' | 'nerdy';
  youtubeHLS?: boolean;
}

interface CobaltSuccessResponse {
  status: 'tunnel' | 'redirect' | 'picker';
  url?: string;
  filename?: string;
  picker?: Array<{
    type: 'video' | 'audio' | 'photo' | 'gif';
    url: string;
    thumb?: string;
  }>;
}

interface CobaltErrorResponse {
  status: 'error';
  error: {
    code: string;
    context?: {
      service?: string;
    };
  };
}

type CobaltResponse = CobaltSuccessResponse | CobaltErrorResponse;

/**
 * Error codes from Cobalt API
 */
export const CobaltErrorCodes = {
  INVALID_URL: 'error.api.link.invalid',
  UNSUPPORTED_SERVICE: 'error.api.service.unsupported',
  CONTENT_UNAVAILABLE: 'error.api.content.unavailable',
  RATE_LIMITED: 'error.api.rate_exceeded',
  FETCH_FAILED: 'error.api.fetch.fail',
  YOUTUBE_AGE_RESTRICTED: 'error.api.youtube.age_restricted',
  YOUTUBE_LOGIN_REQUIRED: 'error.api.youtube.login_required',
  NOT_CONFIGURED: 'cobalt.not_configured',
} as const;

/**
 * Get human-readable error message for Cobalt error codes
 */
function getErrorMessage(code: string): string {
  switch (code) {
    case CobaltErrorCodes.INVALID_URL:
      return 'Invalid YouTube URL';
    case CobaltErrorCodes.UNSUPPORTED_SERVICE:
      return 'This service is not supported';
    case CobaltErrorCodes.CONTENT_UNAVAILABLE:
      return 'Video is unavailable or private';
    case CobaltErrorCodes.RATE_LIMITED:
      return 'Rate limit exceeded, please try again later';
    case CobaltErrorCodes.FETCH_FAILED:
      return 'Failed to fetch video data';
    case CobaltErrorCodes.YOUTUBE_AGE_RESTRICTED:
      return 'Video is age-restricted';
    case CobaltErrorCodes.YOUTUBE_LOGIN_REQUIRED:
      return 'Video requires YouTube login';
    case CobaltErrorCodes.NOT_CONFIGURED:
      return 'Cobalt API URL is not configured';
    default:
      return 'Unknown error occurred';
  }
}

/**
 * Extract audio URL from a YouTube video using Cobalt
 *
 * @param youtubeId - YouTube video ID
 * @returns Object containing the audio download URL
 */
export async function getYouTubeAudioUrl(youtubeId: string): Promise<AudioUrlResult> {
  if (!COBALT_API_URL) {
    throw new Error(
      `${getErrorMessage(CobaltErrorCodes.NOT_CONFIGURED)}. ` +
      'Set COBALT_API_URL environment variable to your self-hosted Cobalt instance.'
    );
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeId}`;

  const requestBody: CobaltRequest = {
    url: youtubeUrl,
    downloadMode: 'audio',
    audioFormat: 'mp3',
    audioBitrate: '128',
    filenameStyle: 'basic',
    youtubeHLS: true,
  };

  const response = await fetch(`${COBALT_API_URL}/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Cobalt] API error response: ${errorText}`);
    throw new Error(`Cobalt API request failed: ${response.status} ${response.statusText}`);
  }

  const data: CobaltResponse = await response.json();

  if (data.status === 'error') {
    const errorCode = data.error.code;
    const errorMessage = getErrorMessage(errorCode);
    throw new Error(`Cobalt API error: ${errorMessage} (${errorCode})`);
  }

  if (data.status === 'picker' && data.picker && data.picker.length > 0) {
    // Find audio option in picker
    const audioOption = data.picker.find(p => p.type === 'audio');
    if (audioOption) {
      console.log(`[Cobalt] Got picker response with audio option`);
      return {
        url: audioOption.url,
        filename: `${youtubeId}.mp3`,
        type: 'picker',
      };
    }
  }

  if ((data.status === 'tunnel' || data.status === 'redirect') && data.url) {
    console.log(`[Cobalt] Got ${data.status} response: ${data.url.substring(0, 100)}...`);
    return {
      url: data.url,
      filename: data.filename || `${youtubeId}.mp3`,
      type: data.status,
    };
  }

  throw new Error('Cobalt API returned unexpected response format');
}

/**
 * Extract and download audio from a YouTube video
 *
 * @param youtubeId - YouTube video ID
 * @returns Audio buffer and metadata
 */
export async function extractYouTubeAudio(youtubeId: string): Promise<AudioExtractionResult> {
  // First, get the audio URL from Cobalt
  const { url, filename, type } = await getYouTubeAudioUrl(youtubeId);

  console.log(`[Cobalt] Downloading audio (${type}): ${url.substring(0, 100)}...`);

  // Then download the audio with proper headers
  const audioResponse = await fetch(url, {
    headers: {
      'Accept': 'audio/mpeg, audio/*, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    redirect: 'follow',
  });

  console.log(`[Cobalt] Download response: status=${audioResponse.status}, ` +
    `content-type=${audioResponse.headers.get('content-type')}, ` +
    `content-length=${audioResponse.headers.get('content-length')}`);

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
  }

  const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
  const audioBuffer = await audioResponse.arrayBuffer();

  console.log(`[Cobalt] Downloaded ${audioBuffer.byteLength} bytes`);

  // Validate that we got actual audio data
  if (audioBuffer.byteLength === 0) {
    throw new Error(
      'Unable to extract audio from this video. ' +
      'This may be a live stream, premiere, or the video may be too long to process.'
    );
  }

  // Check minimum size (valid MP3 should be at least a few KB)
  if (audioBuffer.byteLength < 1000) {
    throw new Error(
      'Audio file is too small. The video may not have downloadable audio.'
    );
  }

  return {
    audioBuffer,
    filename,
    contentType,
    size: audioBuffer.byteLength,
  };
}

/**
 * Create a File object from audio buffer for transcription API
 *
 * @param result - Audio extraction result
 * @returns File object ready for transcription API
 */
export function createAudioFile(result: AudioExtractionResult): File {
  const blob = new Blob([result.audioBuffer], { type: result.contentType });
  return new File([blob], result.filename, { type: result.contentType });
}

/**
 * Check if audio extraction is likely to succeed
 * (Does a lightweight check without downloading)
 */
export async function canExtractAudio(youtubeId: string): Promise<{ canExtract: boolean; error?: string }> {
  try {
    await getYouTubeAudioUrl(youtubeId);
    return { canExtract: true };
  } catch (error) {
    return {
      canExtract: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if Cobalt API is configured
 */
export function isCobaltConfigured(): boolean {
  return !!COBALT_API_URL;
}
