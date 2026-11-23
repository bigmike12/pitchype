import { PageLoading, PanelSkeleton, Skeleton } from "@/components/ui/skeleton";

/** A creator's page on its way, in the same places as the real one. */
export function ProfileSkeleton() {
  return (
    <PageLoading label="Loading profile…">
      <Skeleton className="aspect-[16/9] w-full rounded-frame sm:aspect-[5/2] lg:aspect-[3/1]" />
      <div className="relative -mt-12 flex flex-col gap-5 px-3 sm:-mt-16 sm:px-6 lg:flex-row lg:items-start lg:px-8">
        <Skeleton className="size-28 shrink-0 rounded-panel ring-4 ring-canvas sm:size-36" />
        <div className="flex-1 lg:pt-[5.25rem]">
          <Skeleton className="h-10 w-2/3 rounded-xl sm:h-12" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
      </div>
      <div className="mt-10 grid gap-10 sm:px-6 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-6 w-full max-w-[60ch]" />
          <Skeleton className="mt-3 h-6 w-4/5 max-w-[50ch]" />
          <div className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] rounded-card" />
            ))}
          </div>
        </div>
        <PanelSkeleton lines={3} className="self-start" />
      </div>
    </PageLoading>
  );
}
