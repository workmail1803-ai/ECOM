"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, BadgeCheck, ExternalLink } from "lucide-react";
import type { Review } from "@/types/database";
import { moderateReview } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, Badge, Rating } from "@/components/ui/primitives";

export function ReviewModeration({
  review,
  productName,
  productSlug,
  authorName,
}: {
  review: Review;
  productName: string;
  productSlug: string;
  authorName: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  function moderate(status: "approved" | "rejected") {
    start(async () => {
      const result = await moderateReview(review.id, status);
      if (!result.ok) {
        toast.error(result.error ?? "Could not moderate.");
        return;
      }
      toast.success(result.message ?? "Done.");
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Rating value={review.rating} size={14} />
            {review.is_verified_purchase ? (
              <Badge tone="success">
                <BadgeCheck size={11} />
                Verified purchase
              </Badge>
            ) : (
              <Badge tone="warning">Unverified</Badge>
            )}
            <Badge
              tone={
                review.status === "approved"
                  ? "success"
                  : review.status === "rejected"
                    ? "danger"
                    : "neutral"
              }
            >
              {review.status}
            </Badge>
          </div>

          <p className="mt-1.5 text-xs text-ink-muted">
            {authorName} on{" "}
            {productSlug ? (
              <Link
                href={`/products/${productSlug}`}
                target="_blank"
                className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-700"
              >
                {productName}
                <ExternalLink size={11} />
              </Link>
            ) : (
              productName
            )}{" "}
            ·{" "}
            {new Date(review.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        {review.status === "pending" ? (
          <div className="flex gap-2">
            <Button size="sm" loading={pending} onClick={() => moderate("approved")}>
              <Check size={14} />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={pending}
              onClick={() => moderate("rejected")}
              className="text-danger hover:bg-danger-soft"
            >
              <X size={14} />
              Reject
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={() =>
              moderate(review.status === "approved" ? "rejected" : "approved")
            }
          >
            {review.status === "approved" ? "Reject" : "Approve"}
          </Button>
        )}
      </div>

      {review.title ? (
        <h3 className="mt-3 text-sm font-semibold text-ink">{review.title}</h3>
      ) : null}
      {review.body ? (
        <p className="mt-1 text-sm leading-6 text-ink-soft">{review.body}</p>
      ) : null}
    </Card>
  );
}
