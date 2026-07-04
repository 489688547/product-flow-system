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
- Inputs/selects: consistent height, focus ring, native affordance where possible.
- Badges: semantic color with text, never color-only.
- Metrics: clickable summary rows with icon, label, count and chevron.
- Risk cards: compact list items, not oversized warning blocks.
- Modals: restrained sheet with sticky header/footer and clear action hierarchy.

## Motion

Use 120-180ms transitions for hover, focus and state feedback. No page-load choreography. Disable transform transitions under `prefers-reduced-motion`.
