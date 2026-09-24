/** Reads ?page & ?limit safely. */
export function getPaging(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(maxLimit, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function paged(items, total, { page, limit }) {
  return { items, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Runs find + count for a paged list. `build` receives a fresh query to populate/sort. */
export async function findPaged(Model, filter, paging, build = (q) => q) {
  const [items, total] = await Promise.all([
    build(Model.find(filter)).skip(paging.skip).limit(paging.limit).lean(),
    Model.countDocuments(filter),
  ]);
  return paged(items, total, paging);
}
