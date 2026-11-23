import {
  CardGridSkeleton,
  PageLoading,
  Skeleton,
} from "@/components/ui/skeleton";

/**
 * The directory on its way: the search field, (in public) the niche index,
 * the toolbar and a grid of creator cards, where the real ones will land.
 */
export function DirectorySkeleton({
  inPortal = false,
}: {
  inPortal?: boolean;
}) {
  return (
    <PageLoading label="Loading creators…">
      <div className="flex gap-2 sm:gap-3">
        <Skeleton
          className={
            inPortal
              ? "h-11 flex-1 rounded-control lg:h-10"
              : "h-14 flex-1 rounded-control"
          }
        />
        <Skeleton
          className={
            inPortal
              ? "h-11 w-24 rounded-control lg:h-10"
              : "h-14 w-28 rounded-control"
          }
        />
      </div>
      {!inPortal && (
        <div className="mt-6 flex gap-5 overflow-hidden sm:mt-8 lg:flex-wrap">
          {[3, 7, 5, 9, 6, 8, 7, 10, 5].map((width, index) => (
            <Skeleton
              key={index}
              className="h-7 shrink-0 rounded-md"
              style={{ width: `${width}rem` }}
            />
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-36 rounded-control lg:h-9" />
      </div>
      <CardGridSkeleton variant="creator" count={8} className="mt-6" />
    </PageLoading>
  );
}
