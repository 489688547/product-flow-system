# Design

## Style Direction

内部产品工具，参考 shadcn/ui、Linear、Raycast 和 Apple 系统应用的克制质感。界面以浅色工作区、深色导航、清晰边界、轻量状态色和紧凑信息密度为主。

## Color Tokens

- Background: cool light workspace, not cream or beige.
- Surface: white cards and panels.
- Sidebar: near-black charcoal, used only for app shell identity.
- Primary: vivid blue for active navigation, primary actions and focus rings.
- Semantic: green success, amber warning, red risk, violet review/lifecycle accents.
- Muted text: dark enough for AA contrast on light surfaces.

## Typography

Use the system font stack: SF Pro / PingFang SC / Segoe UI / Microsoft YaHei. Product UI uses one family with a tight scale:

- Page title: 24px, 700.
- Panel title: 15-16px, 700.
- Body/table: 13px.
- Helper text: 12px, with sufficient contrast.

No fluid type, no display fonts, no negative letter spacing.

## Layout

- App shell: fixed-width left rail plus responsive main content.
- Main content: max-width bounded, centered in available workspace.
- Cards and panels: 8px radius, 1px border, subtle shadow only when useful.
- Tables: sticky header, clear row hover, stable column rhythm.
- Mobile/tablet: sidebar becomes compact horizontal nav; dense tables scroll horizontally.

## Components

- Buttons: one primary, one secondary, one ghost style. Icons from Lucide.
- Button states: secondary and utility actions stay neutral by default; hover uses the same light neutral surface and stronger border. Primary blue is reserved for the main commit action, and destructive red appears only on irreversible actions.
- Inputs/selects: consistent height, focus ring, native affordance where possible.
- Table header filters: keep filters inside the relevant table header as a 22px ghost icon next to the label. The label remains visually primary; the icon is neutral by default, uses a subtle surface on hover/expanded/active, and opens a fixed-position menu so it is never clipped by table scroll containers.
- Table row actions: keep row actions inside a single `.table-actions` group. Icon-only actions are fixed 30px squares, text actions share the same 30px height, and action groups do not wrap inside data tables. If a row only needs edit/delete/convert/open, prefer icon-only buttons with clear `title` and `aria-label` instead of widening the action column for text labels.
- Badges: semantic color with text, never color-only.
- Metrics: clickable summary rows with icon, label, count and chevron.
- Risk cards: compact list items, not oversized warning blocks.
- Modals: restrained sheet with sticky header/footer and a scrollable body. Titles stay compact, content uses the same form rhythm as pages, and the footer keeps cancel/secondary actions visually below the primary commit action.
- Surfaces: panels, rows, cards, package files and settings rows share the same 10px panel radius, 1px border and subtle single-step elevation. Hover may lift one step, but nested card shadows are avoided.

## Motion

Use 120-180ms transitions for hover, focus and state feedback. No page-load choreography. Disable transform transitions under `prefers-reduced-motion`.
