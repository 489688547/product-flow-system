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

// 手风琴模式下返回当前页面所属的可折叠分组：进入该分组即只保留它展开，侧栏高度可控。
export function activeCollapsibleGroup(navigation = [], screen = "") {
  const group = groupSidebarNavigation(navigation)
    .find(candidate => candidate.items.some(([key]) => key === screen));
  return group?.collapsible ? group.label : "";
}

export function activeNavigationGroup(groups = [], screen = "") {
  return groups.find(group => group.items.some(([key]) => key === screen)) || groups[0] || null;
}
