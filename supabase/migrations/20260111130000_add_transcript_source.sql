-- Migration: Add transcript_source column to video_analyses
-- Created: 2026-01-11
-- Purpose: Track whether transcript came from YouTube captions or AI transcription

-- =====================================================
-- 1. Add transcript_source column
-- =====================================================
ALTER TABLE public.video_analyses
ADD COLUMN IF NOT EXISTS transcript_source text;

-- 2. Add check constraint for valid values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'video_analyses_transcript_source_check'
      AND conrelid = 'public.video_analyses'::regclass
  ) THEN
    ALTER TABLE public.video_analyses
      ADD CONSTRAINT video_analyses_transcript_source_check
      CHECK (transcript_source IS NULL OR transcript_source IN ('youtube', 'ai'));
  END IF;
END
$$;

-- 3. Add comment for documentation
COMMENT ON COLUMN public.video_analyses.transcript_source IS 'Source of transcript: youtube (YouTube captions via Supadata), ai (AI transcription via Whisper), NULL (legacy/unknown)';

-- =====================================================
-- 4. Update insert_video_analysis_server function
-- =====================================================
CREATE OR REPLACE FUNCTION public.insert_video_analysis_server(
    p_youtube_id text,
    p_title text,
    p_author text,
    p_duration integer,
    p_thumbnail_url text,
    p_transcript jsonb,
    p_topics jsonb,
    p_summary jsonb DEFAULT NULL,
    p_suggested_questions jsonb DEFAULT NULL,
    p_model_used text DEFAULT NULL,
    p_user_id uuid DEFAULT NULL,
    p_language text DEFAULT NULL,
    p_available_languages jsonb DEFAULT NULL,
    p_transcript_source text DEFAULT NULL  -- NEW PARAMETER
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_video_id uuid;
    v_existing_id uuid;
BEGIN
    -- Check if video already exists
    SELECT id INTO v_existing_id
    FROM public.video_analyses
    WHERE youtube_id = p_youtube_id;

    IF v_existing_id IS NULL THEN
        -- New video: insert with created_by set to the user who first generated it
        INSERT INTO public.video_analyses (
            youtube_id, title, author, duration, thumbnail_url,
            transcript, topics, summary, suggested_questions, model_used,
            language, available_languages, created_by, transcript_source
        ) VALUES (
            p_youtube_id, p_title, p_author, p_duration, p_thumbnail_url,
            p_transcript, p_topics, p_summary, p_suggested_questions, p_model_used,
            p_language, p_available_languages, p_user_id, p_transcript_source
        )
        RETURNING id INTO v_video_id;
    ELSE
        -- Video exists: update fields but DO NOT change created_by
        -- Only update non-null values to preserve existing data
        UPDATE public.video_analyses SET
            transcript = COALESCE(p_transcript, transcript),
            topics = COALESCE(p_topics, topics),
            summary = COALESCE(p_summary, summary),
            suggested_questions = COALESCE(p_suggested_questions, suggested_questions),
            language = COALESCE(p_language, language),
            available_languages = COALESCE(p_available_languages, available_languages),
            transcript_source = COALESCE(p_transcript_source, transcript_source),
            updated_at = timezone('utc'::text, now())
        WHERE id = v_existing_id;

        v_video_id := v_existing_id;
    END IF;

    -- Link to user if user_id provided (for user_videos tracking)
    IF p_user_id IS NOT NULL THEN
        INSERT INTO public.user_videos (user_id, video_id, accessed_at)
        VALUES (p_user_id, v_video_id, timezone('utc'::text, now()))
        ON CONFLICT (user_id, video_id) DO UPDATE SET
            accessed_at = timezone('utc'::text, now());
    END IF;

    RETURN v_video_id;
END;
$$;

-- =====================================================
-- 5. Update update_video_analysis_secure function
--    Add support for transcript, topics, and transcript_source
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_video_analysis_secure(
    p_youtube_id text,
    p_user_id uuid,
    p_summary jsonb DEFAULT NULL,
    p_suggested_questions jsonb DEFAULT NULL,
    p_transcript jsonb DEFAULT NULL,           -- NEW PARAMETER
    p_topics jsonb DEFAULT NULL,               -- NEW PARAMETER
    p_transcript_source text DEFAULT NULL      -- NEW PARAMETER
)
RETURNS TABLE (success boolean, video_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_video_id uuid;
    v_created_by uuid;
BEGIN
    -- Get video and check ownership
    SELECT id, created_by INTO v_video_id, v_created_by
    FROM public.video_analyses
    WHERE youtube_id = p_youtube_id;

    -- Video doesn't exist
    IF v_video_id IS NULL THEN
        RETURN QUERY SELECT false::boolean, NULL::uuid;
        RETURN;
    END IF;

    -- Ownership check:
    -- 1. If created_by is NULL (anonymous creation), any authenticated user can update
    -- 2. If created_by matches p_user_id, owner can update
    -- 3. Otherwise, reject the update
    IF v_created_by IS NOT NULL AND v_created_by != p_user_id THEN
        RETURN QUERY SELECT false::boolean, v_video_id;
        RETURN;
    END IF;

    -- Perform the update
    UPDATE public.video_analyses SET
        summary = COALESCE(p_summary, summary),
        suggested_questions = COALESCE(p_suggested_questions, suggested_questions),
        transcript = COALESCE(p_transcript, transcript),
        topics = COALESCE(p_topics, topics),
        transcript_source = COALESCE(p_transcript_source, transcript_source),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_video_id;

    RETURN QUERY SELECT true::boolean, v_video_id;
END;
$$;

-- =====================================================
-- 6. Grant execute permissions
-- =====================================================
GRANT EXECUTE ON FUNCTION public.insert_video_analysis_server TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_video_analysis_server TO anon;
GRANT EXECUTE ON FUNCTION public.update_video_analysis_secure TO authenticated;
