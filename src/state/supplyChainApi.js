export function supplyChainApiUrl() {
  return "/api/supply-chain";
}

export function supplyChainApprovalSyncUrl() {
  return "/api/supply-chain/approvals/sync";
}

export async function syncSupplyApprovalPages({ input = {}, fetchImpl = fetch, now = Date.now(), url = supplyChainApprovalSyncUrl() } = {}) {
  const startTime = Number(input.startTime) || now - 30 * 24 * 60 * 60 * 1000;
  const endTime = Number(input.endTime) || now;
  const counts = { purchase: 0, payment: 0, unmapped: 0, skipped: 0 };

  for (const kind of ["purchase", "payment"]) {
    let cursor = 0;
    const seenCursors = new Set();
    while (!seenCursors.has(cursor)) {
      seenCursors.add(cursor);
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, startTime, endTime, batch: { kind, cursor, size: 18 } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.synced === false) throw new Error(payload.message || "钉钉审批同步失败。");
      for (const key of Object.keys(counts)) counts[key] += Number(payload.counts?.[key] || 0);
      const nextCursor = payload.continuation?.nextCursor;
      if (nextCursor === null || nextCursor === undefined || nextCursor === "") break;
      cursor = Math.max(0, Number(nextCursor) || 0);
    }
  }

  return { synced: true, counts };
}
