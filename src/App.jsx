import { AppWindow, Archive, BadgeDollarSign, BarChart3, BookOpenText, Boxes, BriefcaseBusiness, Bug, Building2, CalendarCheck, CalendarRange, ChartNoAxesCombined, ChevronDown, ClipboardCheck, ClipboardList, Clapperboard, Database, DatabaseZap, FileClock, FileVideo2, GitBranch, Home, KeyRound, LayoutDashboard, ListChecks, LogOut, PackageSearch, PanelsTopLeft, Plug, RefreshCcw, Ruler, Settings, Share2, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Target, Users, UsersRound, Workflow } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { FloatingIssueButton } from "./features/issues/FloatingIssueButton.jsx";
import { useProductFlow } from "./state/ProductFlowProvider.jsx";
import { canAccessCompanyPlatform, canViewNavigation } from "./domain/permissions.js";
import { useAuth } from "./state/AuthProvider.jsx";
import { usePlatform } from "./state/PlatformProvider.jsx";
import { formatAppHash, parseAppHash } from "./domain/appNavigation.js";
import { featureFlagEnabled } from "./domain/featureFlags.js";
import { expandedGroupForScreen, groupSidebarNavigation } from "./domain/sidebarNavigation.js";
import { AiAssistantTrigger } from "./features/ai-assistant/AiAssistantTrigger.jsx";
import { AiAssistantPanel } from "./features/ai-assistant/AiAssistantPanel.jsx";
import { LocalOnlineEnvironmentBanner } from "./ui/LocalOnlineEnvironmentBanner.jsx";

const lazyNamed = (loader, exportName) => lazy(async () => {
  const module = await loader();
  return { default: module[exportName] };
});

const ProductArchivePage = lazyNamed(() => import("./features/archive/ProductArchivePage.jsx"), "ProductArchivePage");
const DashboardPage = lazyNamed(() => import("./features/dashboard/DashboardPage.jsx"), "DashboardPage");
const DemandPoolPage = lazyNamed(() => import("./features/demands/DemandPoolPage.jsx"), "DemandPoolPage");
const IssuePage = lazyNamed(() => import("./features/issues/IssuePage.jsx"), "IssuePage");
const PackagePage = lazyNamed(() => import("./features/packages/PackagePage.jsx"), "PackagePage");
const ProductProgressPage = lazyNamed(() => import("./features/progress/ProductProgressPage.jsx"), "ProductProgressPage");
const SettingsPage = lazyNamed(() => import("./features/settings/SettingsPage.jsx"), "SettingsPage");
const ProductPlanningPage = lazyNamed(() => import("./features/planning/ProductPlanningPage.jsx"), "ProductPlanningPage");
const CompanyHomePage = lazyNamed(() => import("./features/company/CompanyHomePage.jsx"), "CompanyHomePage");
const StrategyCenterPage = lazyNamed(() => import("./features/strategy/StrategyCenterPage.jsx"), "StrategyCenterPage");
const KeyProjectsPage = lazyNamed(() => import("./features/projects/KeyProjectsPage.jsx"), "KeyProjectsPage");
const OperatingReviewPage = lazyNamed(() => import("./features/reviews/OperatingReviewPage.jsx"), "OperatingReviewPage");
const AppCenterPage = lazyNamed(() => import("./features/platform/AppCenterPage.jsx"), "AppCenterPage");
const IncentiveProjectsPage = lazyNamed(() => import("./features/incentives/IncentiveProjectsPage.jsx"), "IncentiveProjectsPage");
const SupplyChainAppPage = lazyNamed(() => import("./features/supply-chain/SupplyChainAppPage.jsx"), "SupplyChainAppPage");
const HandbookPage = lazy(() => import("./features/handbook/HandbookPage.jsx"));
const DataCenterAppPage = lazyNamed(() => import("./features/data-center/DataCenterAppPage.jsx"), "DataCenterAppPage");
const EcommerceOperationsAppPage = lazyNamed(() => import("./features/ecommerce-operations/EcommerceOperationsAppPage.jsx"), "EcommerceOperationsAppPage");
const PerformanceManagementAppPage = lazyNamed(() => import("./features/performance-management/PerformanceManagementAppPage.jsx"), "PerformanceManagementAppPage");
const BrandContentOverviewPage = lazyNamed(() => import("./features/brand-content/BrandContentOverviewPage.jsx"), "BrandContentOverviewPage");
const BrandContentWorkbenchPage = lazyNamed(() => import("./features/brand-content/BrandContentWorkbenchPage.jsx"), "BrandContentWorkbenchPage");
const BrandAssetLibraryPage = lazyNamed(() => import("./features/brand-content/BrandAssetLibraryPage.jsx"), "BrandAssetLibraryPage");
const BrandAdvertisingReviewPage = lazyNamed(() => import("./features/brand-content/BrandAdvertisingReviewPage.jsx"), "BrandAdvertisingReviewPage");
const BrandAccountPage = lazyNamed(() => import("./features/brand-content/BrandAccountPage.jsx"), "BrandAccountPage");
const BrandDecisionPage = lazyNamed(() => import("./features/brand-content/BrandDecisionPage.jsx"), "BrandDecisionPage");
const BrandTeamPage = lazyNamed(() => import("./features/brand-content/BrandTeamPage.jsx"), "BrandTeamPage");
const BrandDataIssuesPage = lazyNamed(() => import("./features/brand-content/BrandDataIssuesPage.jsx"), "BrandDataIssuesPage");
const BrandContentSettingsPage = lazyNamed(() => import("./features/brand-content/BrandContentSettingsPage.jsx"), "BrandContentSettingsPage");
const CollaborationPage = lazyNamed(() => import("./features/collaboration/CollaborationPage.jsx"), "CollaborationPage");
const AiAssistantWorkspace = lazyNamed(() => import("./features/ai-assistant/AiAssistantWorkspace.jsx"), "AiAssistantWorkspace");

const SUPPLY_CHAIN_NAV = [
  ["supply-overview", "供应链总览", LayoutDashboard, "供应链管理", "overview"],
  ["supply-suppliers", "供应商管理", Building2, "供应链管理", "suppliers"],
  ["supply-approvals", "采购与付款", ClipboardCheck, "供应链管理", "approvals"],
  ["supply-products", "产品供应链", PackageSearch, "供应链管理", "products"],
  ["supply-inventory", "库存盘点", Boxes, "供应链管理", "inventory"],
  ["supply-quality", "质量管理", ShieldCheck, "供应链管理", "quality"],
  ["supply-records", "同步记录", FileClock, "供应链管理", "records"],
  ["supply-settings", "设置", Settings, "供应链管理", "settings"]
];
const SUPPLY_CHAIN_SCREEN_TO_SECTION = new Map(SUPPLY_CHAIN_NAV.map(([screen, , , , section]) => [screen, section]));
const DATA_CENTER_NAV = [
  ["data-overview", "数据总览", Database, "数据中心", "overview"],
  ["data-analysis", "数据分析", BarChart3, "数据中心", "analysis"],
  ["data-sources", "数据接入", Plug, "数据中心", "sources"],
  ["data-connections", "平台连接", KeyRound, "数据中心", "connections"],
  ["data-metrics", "指标管理", Ruler, "数据中心", "metrics"],
  ["data-quality", "数据质量", ShieldCheck, "数据中心", "quality"],
  ["data-sync", "同步记录", FileClock, "数据中心", "sync"],
  ["data-services", "数据服务", Share2, "数据中心", "services"],
  ["data-settings", "设置", Settings, "数据中心", "settings"]
];
const DATA_CENTER_SCREEN_TO_SECTION = new Map(DATA_CENTER_NAV.map(([screen, , , , section]) => [screen, section]));
const ECOMMERCE_OPERATIONS_NAV = [
  ["ops-dashboard", "经营驾驶舱", LayoutDashboard, "电商店铺运营", "dashboard"],
  ["ops-focus", "重点产品经营", Target, "电商店铺运营", "focus"],
  ["ops-collaboration", "跨部门协同", Workflow, "电商店铺运营", "collaboration"],
  ["ops-team", "运营团队", Users, "电商店铺运营", "team"],
  ["ops-playbooks", "经营方法库", Sparkles, "电商店铺运营", "playbooks"]
];
const ECOMMERCE_OPERATIONS_SCREEN_TO_SECTION = new Map(ECOMMERCE_OPERATIONS_NAV.map(([screen, , , , section]) => [screen, section]));

const PERFORMANCE_MANAGEMENT_NAV = [
  ["performance-overview", "绩效总览", BarChart3, "人事管理", "overview"],
  ["performance-schemes", "考核方案", ListChecks, "人事管理", "schemes"],
  ["performance-mine", "我的绩效", ClipboardCheck, "人事管理", "mine"],
  ["performance-manager", "主管评估", Users, "人事管理", "manager"],
  ["performance-archive", "复核与归档", RefreshCcw, "人事管理", "archive"]
];
const PERFORMANCE_MANAGEMENT_SCREEN_TO_SECTION = new Map(PERFORMANCE_MANAGEMENT_NAV.map(([screen, , , , section]) => [screen, section]));

const BRAND_NAV = [
  ["content-overview", "内容总览", Clapperboard, "品牌内容协同"],
  ["content-workbench", "内容作战台", Workflow, "品牌内容协同"],
  ["content-assets", "素材资产", FileVideo2, "品牌内容协同"],
  ["content-review", "投放复盘", ChartNoAxesCombined, "品牌内容协同"],
  ["brand-accounts", "品牌账号", Smartphone, "品牌内容协同"],
  ["content-decisions", "补充决策", ListChecks, "品牌内容协同"],
  ["content-team", "团队效能", UsersRound, "品牌内容协同"],
  ["content-issues", "数据问题", DatabaseZap, "品牌内容协同"],
  ["content-settings", "设置", SlidersHorizontal, "品牌内容协同"]
];
const COMPANY_NAV = [
  ["home", "公司首页", LayoutDashboard, "公司经营"],
  ["strategy", "战略中心", Target, "公司经营"],
  ["projects", "重点项目", BriefcaseBusiness, "公司经营"],
  ["incentives", "部门激励", BadgeDollarSign, "公司经营"],
  ["reviews", "经营检查", CalendarCheck, "公司经营"],
  ["collaboration", "部门协同", Workflow, "公司经营"],
  ["apps", "业务 Apps", AppWindow, "公司经营"],
  ...SUPPLY_CHAIN_NAV,
  ["dashboard", "产品总览", PanelsTopLeft, "产品全周期"],
  ["demands", "需求池", ClipboardList, "产品全周期"],
  ["planning", "产品规划", CalendarRange, "产品全周期"],
  ["progress", "产品进度", GitBranch, "产品全周期"],
  ["archive", "产品档案", Archive, "产品全周期"],
  ...DATA_CENTER_NAV,
  ...ECOMMERCE_OPERATIONS_NAV,
  ...PERFORMANCE_MANAGEMENT_NAV,
  ...BRAND_NAV,
  ["handbook", "说明书", BookOpenText, "平台"],
  ["issues", "问题反馈", Bug, "平台"],
  ["settings", "设置", Settings, "平台"]
];
const PRODUCT_NAV = [
  ["dashboard", "总览", Home, "产品全周期"],
  ["demands", "需求池", ClipboardList, "产品全周期"],
  ["planning", "产品规划", CalendarRange, "产品全周期"],
  ["progress", "产品进度", GitBranch, "产品全周期"],
  ["archive", "产品档案", Archive, "产品全周期"],
  ["collaboration", "部门协同", Workflow, "协同执行"],
  ...SUPPLY_CHAIN_NAV,
  ...DATA_CENTER_NAV,
  ...ECOMMERCE_OPERATIONS_NAV,
  ...PERFORMANCE_MANAGEMENT_NAV,
  ...BRAND_NAV,
  ["handbook", "说明书", BookOpenText, "平台"],
  ["issues", "问题反馈", Bug, "平台"],
  ["settings", "设置", Settings, "平台"]
];
const HIDDEN_SCREENS = new Set(["packages", "ai-assistant"]);
const VALID_SCREENS = new Set([...COMPANY_NAV.map(([key]) => key), ...PRODUCT_NAV.map(([key]) => key), ...HIDDEN_SCREENS]);

function resolveScreen(screen) {
  if (screen === "supply-chain") return "supply-overview";
  const resolvedDataScreen = screen === "data-center" ? "data-overview" : screen;
  if (resolvedDataScreen === "ecommerce-operations") return "ops-dashboard";
  return resolvedDataScreen === "performance-management" ? "performance-overview" : resolvedDataScreen;
}

function routeFromHash() {
  const route = parseAppHash(window.location.hash);
  const screen = resolveScreen(route.screen);
  return {
    screen: VALID_SCREENS.has(screen) ? screen : "home",
    detail: route.detail
  };
}

function navigationPermissionKey(screen) {
  if (SUPPLY_CHAIN_SCREEN_TO_SECTION.has(screen)) return "supply-chain";
  const dataPermission = DATA_CENTER_SCREEN_TO_SECTION.has(screen) ? "data-center" : screen;
  if (dataPermission !== screen) return dataPermission;
  if (ECOMMERCE_OPERATIONS_SCREEN_TO_SECTION.has(screen)) return "ecommerce-operations";
  return PERFORMANCE_MANAGEMENT_SCREEN_TO_SECTION.has(screen) ? "performance-management" : screen;
}

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const { screen, detail: routeDetail } = route;
  const [progressFocus, setProgressFocus] = useState(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const aiTriggerRef = useRef(null);
  const { logout, user: sessionUser } = useAuth();
  const { loading: platformLoading, error: platformError } = usePlatform();
  const { state, loading, sharedError, currentUser, setCurrentProduct } = useProductFlow();
  const hasCompanyAccess = canAccessCompanyPlatform(sessionUser);
  const collaborationEnabled = hasCompanyAccess || featureFlagEnabled("executiveCollaborationHub");
  const navigation = useMemo(() => {
    const base = hasCompanyAccess ? COMPANY_NAV : PRODUCT_NAV;
    return collaborationEnabled ? base : base.filter(([key]) => key !== "collaboration");
  }, [collaborationEnabled, hasCompanyAccess]);
  const visibleNavigation = useMemo(() => navigation.filter(([key]) => canViewNavigation(state.settings?.permissions, currentUser, navigationPermissionKey(key))), [currentUser, navigation, state.settings?.permissions]);
  const visibleScreenKeys = useMemo(() => new Set(visibleNavigation.map(([key]) => key)), [visibleNavigation]);
  const defaultScreen = visibleNavigation[0]?.[0] || (hasCompanyAccess ? "home" : "dashboard");
  const screenAllowed = visibleScreenKeys.has(screen) || screen === "ai-assistant" || (screen === "packages" && visibleScreenKeys.has("archive"));
  const activeScreen = screenAllowed ? screen : defaultScreen;
  const [expandedAppGroup, setExpandedAppGroup] = useState(() => expandedGroupForScreen(visibleNavigation, activeScreen));
  const sidebarNavigationGroups = useMemo(() => groupSidebarNavigation(visibleNavigation), [visibleNavigation]);
  const accountMeta = [currentUser?.department, currentUser?.title].filter(Boolean).join(" / ") || "组织信息待同步";
  const accountName = currentUser?.name || "未登录";
  useEffect(() => {
    setExpandedAppGroup(expandedGroupForScreen(visibleNavigation, activeScreen));
  }, [activeScreen, visibleNavigation]);
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
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    if (loading || (hasCompanyAccess && platformLoading)) return;
    if (!screenAllowed) navigate(defaultScreen);
  }, [defaultScreen, hasCompanyAccess, loading, platformLoading, screenAllowed]);
  function showScreen(nextScreen, detail = "") {
    const resolvedScreen = resolveScreen(nextScreen);
    if (!VALID_SCREENS.has(resolvedScreen)) return;
    if (!visibleScreenKeys.has(resolvedScreen) && resolvedScreen !== "ai-assistant" && !(resolvedScreen === "packages" && visibleScreenKeys.has("archive"))) return;
    setRoute({ screen: resolvedScreen, detail });
    window.scrollTo({ top: 0, behavior: "auto" });
    document.body.scrollTo({ top: 0, behavior: "auto" });
    const nextHash = formatAppHash(resolvedScreen, detail);
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
  }
  function navigate(nextScreen) {
    if (nextScreen === "progress") setProgressFocus(null);
    showScreen(nextScreen);
  }
  function openProgress(productId, stage) {
    if (productId) setCurrentProduct(productId);
    setProgressFocus({ productId, stage, tick: Date.now() });
    showScreen("progress");
  }
  const pages = {
    home: <CompanyHomePage onNavigate={navigate} />,
    strategy: <StrategyCenterPage />,
    projects: <KeyProjectsPage />,
    incentives: <IncentiveProjectsPage />,
    reviews: <OperatingReviewPage />,
    collaboration: <CollaborationPage />,
    apps: <AppCenterPage onNavigate={navigate} />,
    dashboard: <DashboardPage onNavigate={navigate} onOpenProgress={openProgress} />,
    demands: <DemandPoolPage onProjectCreated={productId => openProgress(productId, 1)} />,
    planning: <ProductPlanningPage onOpenProgress={openProgress} />,
    progress: <ProductProgressPage focusStage={progressFocus} onNavigate={navigate} />,
    archive: <ProductArchivePage onNavigate={navigate} onOpenProgress={openProgress} />,
    packages: <PackagePage />,
    "ai-assistant": <AiAssistantWorkspace appHint={{ screen: activeScreen, detail: routeDetail }} />,
    "content-overview": <BrandContentOverviewPage onNavigate={showScreen} />,
    "content-workbench": <BrandContentWorkbenchPage />,
    "content-assets": <BrandAssetLibraryPage />,
    "content-review": <BrandAdvertisingReviewPage />,
    "brand-accounts": <BrandAccountPage />,
    "content-decisions": <BrandDecisionPage />,
    "content-team": <BrandTeamPage />,
    "content-issues": <BrandDataIssuesPage />,
    "content-settings": <BrandContentSettingsPage />,
    handbook: <HandbookPage selectedSlug={routeDetail} sessionUser={sessionUser} onSelectDocument={slug => showScreen("handbook", slug)} />,
    issues: <IssuePage />,
    settings: <SettingsPage />
  };
  const supplySection = SUPPLY_CHAIN_SCREEN_TO_SECTION.get(activeScreen);
  const dataSection = DATA_CENTER_SCREEN_TO_SECTION.get(activeScreen);
  const operationsSection = ECOMMERCE_OPERATIONS_SCREEN_TO_SECTION.get(activeScreen);
  const performanceSection = PERFORMANCE_MANAGEMENT_SCREEN_TO_SECTION.get(activeScreen);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="sidebar">
        <div className="brand"><span>{hasCompanyAccess ? "企" : "P"}</span><div><strong>{hasCompanyAccess ? "经营执行平台" : "产品全周期"}</strong><small>{hasCompanyAccess ? "战略与业务协同" : "流程协同系统"}</small></div></div>
        <nav aria-label="主导航">
          {sidebarNavigationGroups.map((group, groupIndex) => {
            const isExpanded = expandedAppGroup === group.label;
            const groupId = `sidebar-group-${groupIndex}`;
            return (
              <div className={`sidebar-app-group${group.collapsible ? " collapsible" : ""}${isExpanded ? " expanded" : ""}`} key={group.label}>
                {group.collapsible ? (
                  <button
                    className="sidebar-group-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={groupId}
                    aria-label={`${isExpanded ? "收起" : "展开"}${group.label}`}
                    onClick={() => setExpandedAppGroup(current => current === group.label ? "" : group.label)}
                  >
                    <span>{group.label}</span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                ) : <span className="sidebar-section-label">{group.label}</span>}
                <div className="sidebar-group-items" id={groupId}>
                  {group.items.map(([key, label, Icon]) => (
                    <div className="sidebar-nav-item" key={key}>
                      <button className={activeScreen === key ? "active" : ""} aria-current={activeScreen === key ? "page" : undefined} onClick={() => navigate(key)}>
                        <Icon size={18} aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
      <main id="main-content">
        <header className="topbar">
          {sharedError || (hasCompanyAccess && platformError) ? <em role="status">{sharedError || platformError}</em> : null}
          {activeScreen !== "ai-assistant" ? <AiAssistantTrigger triggerRef={aiTriggerRef} /> : null}
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button className="account-chip" type="button" aria-label={`${accountName} · ${accountMeta}`} aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
              <span className="account-avatar">{accountName.slice(0, 1)}</span>
              <span className="account-copy"><strong>{loading || (hasCompanyAccess && platformLoading) ? "正在同步数据…" : accountName}</strong><small>{accountMeta}</small></span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            {accountMenuOpen ? (
              <div className="account-menu" role="menu">
                <button type="button" role="menuitem" onClick={logout}><LogOut size={16} aria-hidden="true" />退出账号</button>
              </div>
            ) : null}
          </div>
        </header>
        <LocalOnlineEnvironmentBanner sessionUser={sessionUser} />
        <Suspense fallback={<section className="page"><div className="section-panel empty-state">正在加载页面…</div></section>}>
          {supplySection ? <SupplyChainAppPage section={supplySection} /> : dataSection ? <DataCenterAppPage section={dataSection} /> : operationsSection ? <EcommerceOperationsAppPage section={operationsSection} /> : performanceSection ? <PerformanceManagementAppPage section={performanceSection} /> : pages[activeScreen]}
        </Suspense>
      </main>
      <AiAssistantPanel active={activeScreen !== "ai-assistant"} triggerRef={aiTriggerRef} appHint={{ screen: activeScreen, detail: routeDetail }} />
      <FloatingIssueButton />
    </div>
  );
}
