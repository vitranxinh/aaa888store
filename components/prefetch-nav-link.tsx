"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";

type PrefetchNavLinkProps = React.ComponentProps<typeof Link> & {
  prefetchDelayMs?: number;
};

export function PrefetchNavLink({
  href,
  onMouseEnter,
  onFocus,
  prefetchDelayMs = 120,
  prefetch = false,
  ...props
}: PrefetchNavLinkProps) {
  const router = useRouter();
  const hasPrefetchedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const triggerPrefetch = useCallback(() => {
    if (hasPrefetchedRef.current) return;
    hasPrefetchedRef.current = true;
    router.prefetch(typeof href === "string" ? href : href.toString());
  }, [href, router]);

  const schedulePrefetch = useCallback(() => {
    if (hasPrefetchedRef.current || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      triggerPrefetch();
    }, prefetchDelayMs);
  }, [prefetchDelayMs, triggerPrefetch]);

  return (
    <Link
      {...props}
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event) => {
        schedulePrefetch();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        schedulePrefetch();
        onFocus?.(event);
      }}
    />
  );
}
