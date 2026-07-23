export const WEB_COLLECTION_ADAPTERS = Object.freeze([
  Object.freeze({
    id: "kuaimai",
    enabled: true,
    resources: Object.freeze([
      Object.freeze({ type: "orders", rangeKind: "daily_fact", scheduleVersion: "v1" }),
      Object.freeze({ type: "order_items", rangeKind: "daily_fact", scheduleVersion: "v1" }),
      Object.freeze({ type: "sales_items", rangeKind: "daily_fact", scheduleVersion: "v2" })
    ])
  })
]);
