import { Skeleton } from "@/components/ui/skeleton";

export default function BookDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-6 sm:flex-row">
        <Skeleton className="aspect-[2/3] w-full rounded-lg sm:w-[300px]" />
        <div className="flex-1 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="mt-4 flex flex-wrap gap-3">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        </div>
      </div>

      {/* Metadata skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>

      {/* Reading Controls skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
        <Skeleton className="h-10 w-[200px]" />
      </div>

      {/* Note Editor skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[250px] w-full" />
        <Skeleton className="h-10 w-[150px]" />
      </div>

      {/* Notes List skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      {/* Chat Button skeleton */}
      <Skeleton className="h-10 w-[200px]" />
    </div>
  );
}
