export function WorkspaceNavigation({
  groups = [],
  activeScreen = "",
  onNavigate,
  brandMark = "企",
  brandName = "经营执行平台"
}) {
  const activeGroup = groups.find(group => group.items.some(([key]) => key === activeScreen)) || groups[0];

  return (
    <>
      <aside className="workspace-app-rail">
        <div className="workspace-brand-mark" aria-label={brandName}>{brandMark}</div>
        <nav aria-label="业务 App">
          {groups.map(group => {
            const [entryScreen, , EntryIcon] = group.items[0];
            const active = group.label === activeGroup?.label;
            return (
              <button
                className={`workspace-app-button${active ? " active" : ""}`}
                type="button"
                key={group.label}
                aria-current={active ? "page" : undefined}
                aria-label={group.label}
                title={group.label}
                onClick={() => onNavigate(entryScreen)}
              >
                <EntryIcon size={20} aria-hidden="true" />
                <span>{group.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <aside className="workspace-context-sidebar">
        <header>
          <small>当前 App</small>
          <strong>{activeGroup?.label || "工作台"}</strong>
        </header>
        <nav aria-label={`${activeGroup?.label || "当前 App"}功能`}>
          {(activeGroup?.items || []).map(([key, label, Icon]) => {
            const active = key === activeScreen;
            return (
              <button
                className={`workspace-context-button${active ? " active" : ""}`}
                type="button"
                key={key}
                aria-current={active ? "page" : undefined}
                onClick={() => onNavigate(key)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
