import Link from "next/link";

type Props = {
  pathname: string;
  query: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  totalCount?: number;
  hasNext?: boolean;
};

export function ServerPagination({ pathname, query, page, pageSize, totalCount, hasNext }: Props) {
  const totalPages = typeof totalCount === "number" ? Math.max(1, Math.ceil(totalCount / pageSize)) : null;
  const prevPage = page > 1 ? page - 1 : null;
  const nextPage = typeof totalPages === "number" ? (page < totalPages ? page + 1 : null) : hasNext ? page + 1 : null;

  function buildHref(targetPage: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) {
      params.set("page", String(targetPage));
    } else {
      params.delete("page");
    }
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  }

  if ((typeof totalPages === "number" && totalPages <= 1) || (typeof totalPages !== "number" && !prevPage && !nextPage)) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-soft">
      <div className="text-sm text-slate-500 sm:text-base">
        {typeof totalPages === "number" ? (
          <>
            Trang <span className="font-semibold text-slate-700">{page}</span> / {totalPages}
          </>
        ) : (
          <>
            Trang <span className="font-semibold text-slate-700">{page}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {prevPage ? (
          <Link
            href={buildHref(prevPage)}
            prefetch={false}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Trước
          </Link>
        ) : (
          <span className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400">
            Trước
          </span>
        )}
        {nextPage ? (
          <Link
            href={buildHref(nextPage)}
            prefetch={false}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Sau
          </Link>
        ) : (
          <span className="rounded-2xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-400">
            Sau
          </span>
        )}
      </div>
    </div>
  );
}
