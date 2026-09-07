"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { submitReview, type ActionState } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/field";
import { cn } from "@/lib/utils/cn";

const initial: ActionState = { ok: false };

export function ReviewForm({ productId }: { productId: string }) {
  const [state, action, pending] = useActionState(submitReview, initial);
  const [rating, setRating] = useState(5);
  const [hover, setHover] = useState(0);

  if (state.ok) {
    return (
      <p className="rounded-lg border border-success/20 bg-success-soft px-4 py-3 text-sm font-medium text-success">
        {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Write a review</h3>

      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="rating" value={rating} />

      <div className="mt-3">
        <span className="block text-sm font-medium text-ink-soft">Your rating</span>
        <div className="mt-1 flex gap-0.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              aria-pressed={rating === n}
              className="p-0.5"
            >
              <Star
                size={22}
                className={cn(
                  "transition-colors",
                  n <= (hover || rating)
                    ? "fill-warning text-warning"
                    : "fill-line text-line",
                )}
                strokeWidth={0}
              />
            </button>
          ))}
        </div>
      </div>

      <Field
        label="Title"
        htmlFor="review-title"
        className="mt-3"
        error={state.fieldErrors?.title}
      >
        <Input
          id="review-title"
          name="title"
          maxLength={120}
          placeholder="Sums it up in a few words"
        />
      </Field>

      <Field
        label="Your review"
        htmlFor="review-body"
        required
        className="mt-3"
        error={state.fieldErrors?.body}
      >
        <Textarea
          id="review-body"
          name="body"
          required
          minLength={10}
          maxLength={2000}
          placeholder="How is the build quality? Did it arrive on time?"
        />
      </Field>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" loading={pending} block className="mt-4">
        Submit review
      </Button>
      <p className="mt-2 text-[11px] text-ink-muted">
        Reviews appear after a quick moderation check.
      </p>
    </form>
  );
}
