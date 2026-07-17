import {
  Boxes,
  Building2,
  ClipboardCheck,
  FileClock,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck
} from "lucide-react";

const SECTION_GROUPS = [
  {
    label: "日常业务",
    items: [
      ["overview", "供应链总览", LayoutDashboard],
      ["suppliers", "供应商管理", Building2],
      ["approvals", "采购与付款", ClipboardCheck],
      ["products", "产品供应链", PackageSearch],
      ["inventory", "库存盘点", Boxes],
      ["quality", "质量管理", ShieldCheck]
    ]
  },
  {
    label: "数据与配置",
    items: [
      ["records", "同步记录", FileClock],
      ["settings", "设置", Settings]
    ]
  }
];

export function SupplyChainSectionNav({ section, onChange }) {
  return (
    <nav className="supply-chain-section-nav" aria-label="供应链管理二级导航">
      {SECTION_GROUPS.map(group => (
        <div className="supply-chain-nav-group" key={group.label}>
          <span className="supply-chain-nav-label">{group.label}</span>
          {group.items.map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
              onClick={() => onChange(key)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
