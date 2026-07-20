import { readCompanyState } from "../../../../../state.js";

function select(record = {}, keys = []) {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

export async function buildProductContext(db) {
  const stored = await readCompanyState(db);
  const state = stored?.state || {};
  return {
    records: {
      demands: (state.demands || []).slice(0, 40).map(item => select(item, ["id", "name", "title", "status", "priority", "owner", "createdAt"])),
      products: (state.products || []).slice(0, 80).map(item => select(item, ["id", "name", "level", "status", "owner", "currentStage", "launchDate"])),
      tasks: (state.tasks || []).filter(item => item.status !== "completed").slice(0, 80)
        .map(item => select(item, ["id", "productId", "title", "status", "dueDate", "owner"]))
    },
    updatedAt: stored?.updatedAt || ""
  };
}
