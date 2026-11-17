import { DisputeSkeleton } from "@/components/engagement/dispute-skeleton";

export default function Loading() {
  return (
    <div className="max-w-3xl">
      <DisputeSkeleton decide />
    </div>
  );
}
