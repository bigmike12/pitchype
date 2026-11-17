import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
  Skeleton,
} from "@/components/ui/skeleton";

/**
 * The dispute page while it loads: the header, the status callout, the job's
 * terms, the statements and the add-a-statement form. `decide` adds the
 * admin's decision card above them.
 */
export function DisputeSkeleton({ decide = false }: { decide?: boolean }) {
  return (
    <PageLoading label="Loading the dispute…">
      <HeaderSkeleton crumbs />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-card" />
        {decide && <PanelSkeleton lines={5} />}
        <PanelSkeleton lines={5} />
        <PanelSkeleton lines={4} />
        <div className="space-y-4 rounded-card p-5 panel sm:p-6">
          <Skeleton className="h-6 w-1/3 min-w-32" />
          <Skeleton className="h-28 w-full rounded-control" />
          <Skeleton className="h-12 w-36 rounded-control" />
        </div>
      </div>
    </PageLoading>
  );
}
