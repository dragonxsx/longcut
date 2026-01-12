import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import {
  getTranscriptionUsageStats,
  TRANSCRIPTION_LIMITS,
  TRANSCRIPTION_TOPUP_MINUTES,
} from '@/lib/transcription-manager';

/**
 * GET /api/transcription-usage
 *
 * Gets the user's transcription minute usage and remaining credits.
 * Requires authentication.
 *
 * Response:
 * {
 *   success: boolean,
 *   isProUser: boolean,
 *   usage?: {
 *     subscriptionMinutes: {
 *       used: number,
 *       limit: number,
 *       remaining: number
 *     },
 *     topupMinutes: number,
 *     totalRemaining: number,
 *     periodStart: string,
 *     periodEnd: string,
 *     resetAt: string
 *   },
 *   limits: {
 *     pro: number,
 *     topupPackage: number
 *   }
 * }
 */
async function handler(_request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required',
        },
        { status: 401 }
      );
    }

    // Get usage stats - pass user for unlimited check
    const stats = await getTranscriptionUsageStats(user.id, {
      client: supabase,
      user,
    });

    // Check if user is unlimited or Pro
    const isUnlimited = stats?.isUnlimited ?? false;
    const isProUser = isUnlimited || (stats ? stats.subscriptionMinutes.limit > 0 : false);

    if (!stats) {
      return NextResponse.json({
        success: true,
        isProUser: false,
        usage: null,
        limits: {
          pro: TRANSCRIPTION_LIMITS.pro,
          topupPackage: TRANSCRIPTION_TOPUP_MINUTES,
        },
      });
    }

    return NextResponse.json({
      success: true,
      isProUser,
      isUnlimited,
      usage: {
        subscriptionMinutes: stats.subscriptionMinutes,
        topupMinutes: stats.topupMinutes,
        totalRemaining: stats.totalRemaining,
        periodStart: stats.periodStart.toISOString(),
        periodEnd: stats.periodEnd.toISOString(),
        resetAt: stats.resetAt,
        isUnlimited: stats.isUnlimited,
      },
      limits: {
        pro: TRANSCRIPTION_LIMITS.pro,
        topupPackage: TRANSCRIPTION_TOPUP_MINUTES,
      },
    });
  } catch (error) {
    console.error('Error getting transcription usage:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred while getting usage data',
      },
      { status: 500 }
    );
  }
}

export const GET = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED);
