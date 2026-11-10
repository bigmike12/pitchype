import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

// A safety net for any portal page that suspends before its own Suspense
// boundary. Pages normally show their own, closer-fitting skeleton.
export default function Loading() {
  return (
    <PageLoading label="Loading…">
      <HeaderSkeleton />
      <div className="space-y-4">
        <PanelSkeleton lines={3} />
        <PanelSkeleton lines={2} />
      </div>
    </PageLoading>
  );
}
