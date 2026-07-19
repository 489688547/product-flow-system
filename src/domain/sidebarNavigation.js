export const COLLAPSIBLE_APP_GROUPS = new Set([
  "产品全周期",
  "供应链管理",
  "数据中心",
  "电商店铺运营",
  "人事管理",
  "品牌内容协同"
]);

export function groupSidebarNavigation(navigation = []) {
  const groups = [];
  for (const item of navigation) {
    const label = item[3];
    const previous = groups.at(-1);
    if (previous?.label === label) previous.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return groups.map(group => ({
    ...group,
    collapsible: COLLAPSIBLE_APP_GROUPS.has(group.label) && group.items.length > 1
  }));
}

export function expandedGroupForScreen(navigation = [], screen = "") {
  const group = groupSidebarNavigation(navigation)
    .find(candidate => candidate.items.some(([key]) => key === screen));
  if (!group?.collapsible || group.items[0]?.[0] === screen) return "";
  return group.label;
}
