import { Skeleton, SkeletonRows } from "@/components/ui/Card";

/**
 * Route-level loading skeleton.
 *
 * A layout-shaped placeholder reads as "the page is arriving" rather than the
 * generic centred spinner the app used to show, and it avoids the layout jump
 * that a full-page spinner causes.
 */
export default function LoadingPage() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading page">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-panel">
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonRows rows={6} columns={3} />
      </div>
    </div>
  );
}