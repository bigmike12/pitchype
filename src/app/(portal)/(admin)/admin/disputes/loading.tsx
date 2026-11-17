import {
  HeaderSkeleton,
  PageLoading,
  PanelSkeleton,
} from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="max-w-4xl">
      <PageLoading label="Loading disputes…">
        <HeaderSkeleton />
        <div className="space-y-3">
          <PanelSkeleton lines={3} />
          <PanelSkeleton lines={3} />
        </div>
      </PageLoading>
    </div>
  );
}
