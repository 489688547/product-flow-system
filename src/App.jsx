import { AppWindow, Archive, BadgeDollarSign, BriefcaseBusiness, Bug, CalendarCheck, CalendarRange, ChevronDown, ClipboardList, GitBranch, LayoutDashboard, LogOut, PanelsTopLeft, Settings, Target } from "lucide-react";
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
import { usePlatform } from "./state/PlatformProvider.jsx";
import { CompanyHomePage } from "./features/company/CompanyHomePage.jsx";
import { StrategyCenterPage } from "./features/strategy/StrategyCenterPage.jsx";
import { KeyProjectsPage } from "./features/projects/KeyProjectsPage.jsx";
import { OperatingReviewPage } from "./features/reviews/OperatingReviewPage.jsx";
import { AppCenterPage } from "./features/platform/AppCenterPage.jsx";
import { IncentiveProjectsPage } from "./features/incentives/IncentiveProjectsPage.jsx";

const NAV = [
  ["home", "公司首页", LayoutDashboard, "公司经营"],
  ["strategy", "战略中心", Target, "公司经营"],
  ["projects", "重点项目", BriefcaseBusiness, "公司经营"],
  ["incentives", "部门激励", BadgeDollarSign, "公司经营"],
  ["reviews", "经营检查", CalendarCheck, "公司经营"],
  ["apps", "业务 Apps", AppWindow, "公司经营"],
  ["dashboard", "产品总览", PanelsTopLeft, "产品全周期"],
  ["demands", "需求池", ClipboardList, "产品全周期"],
  ["planning", "产品规划", CalendarRange, "产品全周期"],
  ["progress", "产品进度", GitBranch, "产品全周期"],
  ["archive", "产品档案", Archive, "产品全周期"],
  ["issues", "问题反馈", Bug, "平台"],
  ["settings", "设置", Settings, "平台"]
];
const HIDDEN_SCREENS = new Set(["packages"]);
const VALID_SCREENS = new Set([...NAV.map(([key]) => key), ...HIDDEN_SCREENS]);

function screenFromHash() {
  const screen = window.location.hash.replace(/^#/, "");
  return VALID_SCREENS.has(screen) ? screen : "home";
}

export default function App() {
  const [screen, setScreen] = useState(screenFromHash);
  const [progressFocus, setProgressFocus] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const { logout } = useAuth();
  const { loading: platformLoading, error: platformError } = usePlatform();
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
    if (loading || platformLoading) return;
    const allowed = visibleScreenKeys.has(screen) || (screen === "packages" && visibleScreenKeys.has("archive"));
    if (!allowed) navigate(visibleNavigation[0]?.[0] || "home");
  }, [loading, platformLoading, screen, visibleNavigation, visibleScreenKeys]);
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
    home: <CompanyHomePage onNavigate={navigate} />,
    strategy: <StrategyCenterPage />,
    projects: <KeyProjectsPage />,
    incentives: <IncentiveProjectsPage />,
    reviews: <OperatingReviewPage />,
    apps: <AppCenterPage onNavigate={navigate} />,
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
        <div className="brand"><span>企</span><div><strong>经营执行平台</strong><small>战略与业务协同</small></div></div>
        <nav aria-label="主导航">{visibleNavigation.map(([key, label, Icon, group], index) => <div className="sidebar-nav-item" key={key}>{index === 0 || visibleNavigation[index - 1]?.[3] !== group ? <span className="sidebar-section-label">{group}</span> : null}<button className={screen === key ? "active" : ""} aria-current={screen === key ? "page" : undefined} onClick={() => navigate(key)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button></div>)}</nav>
      </aside>
      <main id="main-content">
        <header className="topbar">
          {sharedError || platformError ? <em role="status">{sharedError || platformError}</em> : null}
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button className="account-chip" type="button" aria-label={`${accountName} · ${accountMeta}`} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
              <span className="account-avatar">{accountName.slice(0, 1)}</span>
              <span className="account-copy"><strong>{loading || platformLoading ? "正在同步数据…" : accountName}</strong><small>{accountMeta}</small></span>
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
