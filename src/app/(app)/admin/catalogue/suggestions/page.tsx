import { requirePageModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Lightbulb } from "lucide-react";
import { HeroCard } from "@/components/HeroCard";
import { SuggestionReviewClient } from "./SuggestionReviewClient";

export const metadata = { title: "Suggestion Review" };
export const dynamic = "force-dynamic";

export default async function AdminSuggestionsPage() {
  await requirePageModerator();

  const raw = await prisma.catalogueSuggestion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      submitter: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true, email: true } },
    },
  });

  const suggestions = raw.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    reviewedAt: s.reviewedAt?.toISOString() || null,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div>
      <HeroCard
        icon={<Lightbulb className="h-5 w-5" />}
        title="Suggestion Review"
        subtitle="Review and approve or reject community app suggestions."
      />
      <SuggestionReviewClient initialSuggestions={suggestions} />
    </div>
  );
}
