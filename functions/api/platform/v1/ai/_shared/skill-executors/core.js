import { buildProductContext } from "../context-builders/product.js";
import {
  buildCommitmentsContext,
  buildOperatingReviewsContext,
  buildProjectsContext,
  buildStrategyContext
} from "../context-builders/strategy.js";
import { buildSupplyChainContext } from "../context-builders/supply-chain.js";
import { buildDataQualityContext, buildSalesOperationsContext } from "../context-builders/data-center.js";

function matches(record, { query = "", status = "" } = {}) {
  if (!record || typeof record !== "object") return true;
  if (status && String(record.status || "") !== status) return false;
  return !query || JSON.stringify(record).toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function filterRecords(value, args = {}) {
  if (Array.isArray(value)) return value.filter(item => matches(item, args)).slice(0, args.limit || 40);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, filterRecords(nested, args)]));
}

async function filtered(builder, db, args, scope) {
  const built = await builder(db, { scope });
  return { records: filterRecords(built.records, args), updatedAt: built.updatedAt || "" };
}

export const CORE_SKILL_EXECUTORS = Object.freeze({
  strategy_query_strategies: ({ db, args, access }) => filtered(buildStrategyContext, db, args, access.scope),
  strategy_query_projects: ({ db, args, access }) => filtered(buildProjectsContext, db, args, access.scope),
  strategy_query_commitments: ({ db, args, access }) => filtered(buildCommitmentsContext, db, args, access.scope),
  strategy_query_reviews: ({ db, args, access }) => filtered(buildOperatingReviewsContext, db, args, access.scope),
  product_flow_query_lifecycle: ({ db, args, access }) => filtered(buildProductContext, db, args, access.scope),
  supply_chain_query_status: ({ db, args, access }) => filtered(buildSupplyChainContext, db, args, access.scope),
  data_center_query_sales: async ({ db, args, access }) => {
    const built = await buildSalesOperationsContext(db, { scope: access.scope });
    const records = (built.records || []).filter(item => {
      if (args.from && String(item.date || "") < args.from) return false;
      if (args.to && String(item.date || "") > args.to) return false;
      if (args.platform && String(item.platform || "") !== args.platform) return false;
      return true;
    }).slice(0, args.limit || 100);
    return { records, updatedAt: built.updatedAt || "" };
  },
  data_center_query_quality: ({ db, args, access }) => filtered(buildDataQualityContext, db, args, access.scope)
});
