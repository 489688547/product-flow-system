import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button.jsx";

export function TablePagination({ total = 0, page = 1, pageSize = 50, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = total ? (safePage - 1) * pageSize + 1 : 0;
  const end = Math.min(total, safePage * pageSize);
  return <nav className="table-pagination" aria-label="表格分页">
    <span>显示 {start}–{end}，共 {total.toLocaleString("zh-CN")} 条</span>
    <div>
      <Button className="compact" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}><ChevronLeft size={15} />上一页</Button>
      <b aria-live="polite">{safePage} / {pages}</b>
      <Button className="compact" disabled={safePage >= pages} onClick={() => onPageChange(safePage + 1)}>下一页<ChevronRight size={15} /></Button>
    </div>
  </nav>;
}
