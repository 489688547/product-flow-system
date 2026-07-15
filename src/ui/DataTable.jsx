export function DataTable({ columns, rows, empty, minWidth = 880, className = "" }) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className="data-table" style={{ "--table-min-width": `${minWidth}px` }}>
        <thead>
          <tr>
            {columns.map(column => <th key={column.key} aria-sort={column.ariaSort}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map(row => (
            <tr key={row.id}>
              {columns.map(column => (
                <td key={column.key} data-label={column.label || (typeof column.header === "string" ? column.header : column.key)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={columns.length}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TableActions({ children }) {
  return <div className="table-actions">{children}</div>;
}
