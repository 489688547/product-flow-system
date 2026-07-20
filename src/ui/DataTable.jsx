import { useState } from "react";

// Warn once per session (dev only) when rows lack a stable `id`, so missing
// ids surface as an actionable hint instead of a silent React key warning.
let missingRowIdWarned = false;

const SKELETON_CELL_STYLE = {
  height: 14,
  borderRadius: 4,
  background: "var(--surface-hover)",
  maxWidth: "70%"
};

export function DataTable({
  columns,
  rows,
  empty,
  minWidth = 880,
  className = "",
  getRowProps,
  loading = false,
  loadingRows = 5,
  error = null,
  onRetry,
  maxRows = null
}) {
  const [expanded, setExpanded] = useState(false);

  const rowLimit = typeof maxRows === "number" && maxRows > 0 ? Math.floor(maxRows) : null;
  const truncated = !loading && !error && rowLimit !== null && rows.length > rowLimit && !expanded;
  const visibleRows = truncated ? rows.slice(0, rowLimit) : rows;

  const rowKey = (row, index) => {
    if (row && row.id !== undefined && row.id !== null) return row.id;
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV && !missingRowIdWarned) {
      missingRowIdWarned = true;
      console.warn(
        "[DataTable] row 缺少唯一 id，已回退到 index 作为 key。请为数据行补充稳定 id 以避免重排时状态错乱。"
      );
    }
    return `row-${index}`;
  };

  const renderBody = () => {
    if (loading) {
      return Array.from({ length: Math.max(1, loadingRows) }, (_, rowIndex) => (
        <tr key={`skeleton-${rowIndex}`} aria-hidden="true">
          {columns.map(column => (
            <td key={column.key}>
              <div style={SKELETON_CELL_STYLE} />
            </td>
          ))}
        </tr>
      ));
    }

    if (error) {
      return (
        <tr>
          <td colSpan={columns.length}>
            <div role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <span>{typeof error === "string" ? error : "数据加载失败"}</span>
              {onRetry ? (
                <button type="button" className="btn compact" onClick={onRetry}>
                  重试
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    }

    if (!rows.length) {
      return <tr><td colSpan={columns.length}>{empty}</td></tr>;
    }

    return (
      <>
        {visibleRows.map((row, index) => {
          const rowProps = getRowProps?.(row, index) || {};
          return (
            <tr key={rowKey(row, index)} {...rowProps}>
              {columns.map(column => (
                <td key={column.key} data-label={column.label || (typeof column.header === "string" ? column.header : column.key)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
        {truncated ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: "center" }}>
              <button
                type="button"
                className="btn compact"
                onClick={() => setExpanded(true)}
                aria-expanded="false"
              >
                显示全部（{rows.length}）
              </button>
            </td>
          </tr>
        ) : null}
        {expanded && rowLimit !== null && rows.length > rowLimit ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: "center" }}>
              <button
                type="button"
                className="btn compact"
                onClick={() => setExpanded(false)}
                aria-expanded="true"
              >
                收起
              </button>
            </td>
          </tr>
        ) : null}
      </>
    );
  };

  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table
        className="data-table"
        style={{ "--table-min-width": `${minWidth}px` }}
        aria-busy={loading || undefined}
      >
        <thead>
          <tr>
            {columns.map(column => <th key={column.key} aria-sort={column.ariaSort}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {renderBody()}
        </tbody>
      </table>
    </div>
  );
}

export function TableActions({ children }) {
  return <div className="table-actions">{children}</div>;
}
