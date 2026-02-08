"use client";

import { Button } from "@/components/ui/button";

/**
 * Properties for the SuggestedQuestions component.
 */
interface SuggestedQuestionsProps {
  /** The list of strings to be displayed as clickable suggestion buttons. */
  questions: string[];
  /** Callback function executed when a suggestion is clicked. Passes the text and index. */
  onQuestionClick: (question: string, index: number) => void;
  /** Optional: Indicates if data is currently being fetched. */
  isLoading?: boolean;
  /** Optional: If true, disables buttons to prevent multiple clicks during an active chat. */
  isChatLoading?: boolean;
}

/**
 * Renders a list of suggested prompts for the user to interact with.
 * Designed to appear at the end of a chat sequence.
 */
export function SuggestedQuestions({
  questions,
  onQuestionClick,
  isChatLoading = false,
}: SuggestedQuestionsProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-end gap-2">
      {questions.map((question, idx) => {
        return (
          <Button
            key={`${question}-${idx}`}
            variant="pill"
            size="sm"
            className="self-end w-fit h-auto max-w-full sm:max-w-[80%] justify-start text-left whitespace-normal break-words leading-snug py-2 px-4 transition-colors hover:bg-neutral-100"
            onClick={() => onQuestionClick(question, idx)}
            disabled={isChatLoading}
          >
            {question}
          </Button>
        );
      })}
    </div>
  );
}