import { Archive, Bug, CalendarRange, ChevronDown, ClipboardList, GitBranch, Home, LogOut, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProductArchivePage } from "./features/archive/ProductArchivePage.jsx";
import { DashboardPage } from "./features/dashboard/DashboardPage.jsx";
import { DemandPoolPage } from "./features/demands/DemandPoolPage.jsx";
import { FloatingIssueButton } from "./features/issues/FloatingIssueButton.jsx";
import { IssuePage } from "./features/issues/IssuePage.jsx";
import { PackagePage } from "./features/packages/PackagePage.jsx";
import { ProductProgressPage } from "./features/progress/ProductProgressPage.jsx";
import { SettingsPage } from "./features/settings/SettingsPage.jsx";
import { ProductPlanningPage } from "./features/planning/ProductPlanningPage.jsx";
import { useProductFlow } from "./state/ProductFlowProvider.jsx";
import { canViewNavigation } from "./domain/permissions.js";
import { useAuth } from "./state/AuthProvider.jsx";

const NAV = [
  ["dashboard", "总览", Home],
  ["demands", "需求池", ClipboardList],
  ["planning", "产品规划", CalendarRange],
  ["progress", "产品进度", GitBranch],
  ["archive", "产品档案", Archive],
  ["issues", "问题反馈", Bug],
  ["settings", "设置", Settings]
];
const HIDDEN_SCREENS = new Set(["packages"]);
const VALID_SCREENS = new Set([...NAV.map(([key]) => key), ...HIDDEN_SCREENS]);

function screenFromHash() {
  const screen = window.location.hash.replace(/^#/, "");
  return VALID_SCREENS.has(screen) ? screen : "dashboard";
}

export default function App() {
  const [screen, setScreen] = useState(screenFromHash);
  const [progressFocus, setProgressFocus] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const { logout } = useAuth();
  const { state, loading, sharedError, currentUser, setCurrentProduct } = useProductFlow();
  const visibleNavigation = useMemo(() => NAV.filter(([key]) => canViewNavigation(state.settings?.permissions, currentUser, key)), [currentUser, state.settings?.permissions]);
  const visibleScreenKeys = useMemo(() => new Set(visibleNavigation.map(([key]) => key)), [visibleNavigation]);
  const accountMeta = [currentUser?.department, currentUser?.title].filter(Boolean).join(" / ") || "组织信息待同步";
  const accountName = currentUser?.name || "未登录";
  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const close = event => {
      if (event.key === "Escape" || !accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [accountMenuOpen]);
  useEffect(() => {
    const onHashChange = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (loading) return;
    const allowed = visibleScreenKeys.has(screen) || (screen === "packages" && visibleScreenKeys.has("archive"));
    if (!allowed) navigate(visibleNavigation[0]?.[0] || "dashboard");
  }, [loading, screen, visibleNavigation, visibleScreenKeys]);
  function navigate(nextScreen) {
    if (!VALID_SCREENS.has(nextScreen)) return;
    if (!visibleScreenKeys.has(nextScreen) && !(nextScreen === "packages" && visibleScreenKeys.has("archive"))) return;
    setScreen(nextScreen);
    if (window.location.hash !== `#${nextScreen}`) window.location.hash = nextScreen;
  }
  function openProgress(productId, stage) {
    if (productId) setCurrentProduct(productId);
    setProgressFocus({ productId, stage, tick: Date.now() });
    navigate("progress");
  }
  const pages = {
    dashboard: <DashboardPage onNavigate={navigate} onOpenProgress={openProgress} />,
    demands: <DemandPoolPage onProjectCreated={productId => openProgress(productId, 1)} />,
    planning: <ProductPlanningPage />,
    progress: <ProductProgressPage focusStage={progressFocus} onNavigate={navigate} />,
    archive: <ProductArchivePage onNavigate={navigate} />,
    packages: <PackagePage />,
    issues: <IssuePage />,
    settings: <SettingsPage />
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <div className="brand"><span>P</span><div><strong>产品全周期</strong><small>流程协同系统</small></div></div>
        <nav aria-label="主导航">{visibleNavigation.map(([key, label, Icon]) => <button key={key} className={screen === key ? "active" : ""} aria-current={screen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>)}</nav>
      </aside>
      <main id="main-content">
        <header className="topbar">
          {sharedError ? <em role="status">{sharedError}</em> : null}
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button className="account-chip" type="button" aria-label={`${accountName} · ${accountMeta}`} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
              <span className="account-avatar">{accountName.slice(0, 1)}</span>
              <span className="account-copy"><strong>{loading ? "正在同步数据…" : accountName}</strong><small>{accountMeta}</small></span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                <button type="button" role="menuitem" onClick={logout}><LogOut size={16} aria-hidden="true" />退出账号</button>
              </div>
            ) : null}
          </div>
        </header>
        {pages[screen]}
      </main>
      <FloatingIssueButton />
    </div>
  );
}
