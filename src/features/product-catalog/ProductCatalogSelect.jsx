import { Check, ChevronDown, Search, Unlink } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { FloatingMenu } from "../../ui/FloatingMenu.jsx";

function matches(item, query) {
  if (!query) return true;
  const haystack = [item.name, item.merchantCode, item.category, item.brand, ...(item.skus || []).flatMap(sku => [sku.barcode, sku.merchantSkuCode])].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export function ProductCatalogSelect({ items = [], value = "", onChange, placeholder = "选择 ERP 商品…", disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef(null);
  const selected = items.find(item => item.id === value);
  const filtered = useMemo(() => items.filter(item => matches(item, query.trim())).slice(0, 100), [items, query]);
  const choose = id => {
    onChange?.(id);
    setOpen(false);
    setQuery("");
  };
  return <div className="product-catalog-select">
    <button ref={anchorRef} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen(current => !current)}>
      <span>{selected ? <><strong>{selected.name}</strong><small>{selected.merchantCode || "未设置主商家编码"}</small></> : placeholder}</span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    <FloatingMenu anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} className="product-catalog-select-menu" minWidth={360} maxHeight={360} role="listbox" ariaLabel="ERP 商品目录">
      <label><Search size={15} aria-hidden="true" /><span className="sr-only">搜索 ERP 商品</span><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索商品、69 码或商家编码" /></label>
      {value ? <button type="button" role="option" aria-selected="false" className="unlink" onClick={() => choose("")}><Unlink size={15} aria-hidden="true" /><span><strong>解除 ERP 关联</strong><small>保留当前产品档案中的 69 码</small></span></button> : null}
      <div className="product-catalog-select-options">
        {filtered.map(item => <button type="button" role="option" aria-selected={item.id === value} key={item.id} onClick={() => choose(item.id)}><span><strong>{item.name}</strong><small>{item.merchantCode || "无主商家编码"} · {(item.skus || []).map(sku => sku.barcode).filter(Boolean).slice(0, 2).join(" / ") || "无条码"}</small></span>{item.id === value ? <Check size={15} aria-hidden="true" /> : null}</button>)}
        {!filtered.length ? <div className="empty-state compact-empty">没有匹配的 ERP 商品</div> : null}
        {items.length > 100 && filtered.length === 100 ? <small className="product-catalog-select-limit">结果较多，请继续输入名称或编码缩小范围。</small> : null}
      </div>
    </FloatingMenu>
  </div>;
}
