import { Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { generateProductCover } from "../domain/productFlow.js";
import { FloatingMenu } from "./FloatingMenu.jsx";

export function ProductPicker({ products, value, onChange, label = "切换产品", className = "" }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const product = products.find(item => item.id === value) || products[0];

  if (!product) return null;

  return (
    <div className={`product-picker ${className}`.trim()}>
      <button
        ref={anchorRef}
        type="button"
        className="product-identity-select"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <img className="product-identity-thumb" src={product.image || generateProductCover(product.name)} alt="" width="40" height="40" />
        <span className="product-identity-copy">
          <strong>{product.name}</strong>
          <em>{product.level || "未定级"}</em>
        </span>
        <ChevronDown className="product-switch-icon" size={16} aria-hidden="true" />
      </button>
      <FloatingMenu
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        className="product-switch-menu"
        minWidth={300}
        maxHeight={320}
        role="listbox"
        ariaLabel="选择产品"
      >
        {products.map(item => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={item.id === product.id}
            className={`product-switch-option ${item.id === product.id ? "active" : ""}`}
            onClick={() => {
              onChange(item.id);
              setOpen(false);
            }}
          >
            <img src={item.image || generateProductCover(item.name)} alt="" width="38" height="38" loading="lazy" />
            <span>
              <strong>{item.name}</strong>
              <em>{item.level || "未定级"}</em>
            </span>
            {item.id === product.id ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
