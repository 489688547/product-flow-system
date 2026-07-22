import { Check, ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { formatExpectedLaunchMonth } from "../domain/expectedLaunch.js";
import { generateProductCover } from "../domain/productFlow.js";
import { isProductOwnedBy, prioritizeOwnedProducts } from "../domain/productOwnership.js";
import { FloatingMenu } from "./FloatingMenu.jsx";
import { ProductOwnershipBadge } from "./ProductOwnershipBadge.jsx";

export function ProductPicker({ products, value, onChange, currentUser, label = "切换产品", className = "" }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const product = products.find(item => item.id === value) || products[0];
  const orderedProducts = useMemo(
    () => prioritizeOwnedProducts(products, currentUser),
    [currentUser, products]
  );

  if (!product) {
    return (
      <div className={`product-picker ${className}`.trim()}>
        <button
          type="button"
          className="product-identity-select"
          aria-label={label}
          disabled
          title="暂无可用产品"
        >
          <span className="product-identity-thumb" aria-hidden="true" />
          <span className="product-identity-copy">
            <span className="product-name-line">
              <strong>暂无可用产品</strong>
            </span>
            <em>请先创建或选择一个产品</em>
          </span>
          <ChevronDown className="product-switch-icon" size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }
  const productMeta = item => item.levelConfirmed ? item.level : `期望上线：${formatExpectedLaunchMonth(item.expectedLaunchMonth)}`;
  const owned = item => isProductOwnedBy(item, currentUser);

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
          <span className="product-name-line">
            <strong>{product.name}</strong>
            <ProductOwnershipBadge owned={owned(product)} />
          </span>
          <em>{productMeta(product)}</em>
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
        focusOnOpen
        enableArrowNavigation
      >
        {orderedProducts.map(item => (
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
            <span className="product-switch-copy">
              <span className="product-name-line">
                <strong>{item.name}</strong>
                <ProductOwnershipBadge owned={owned(item)} />
              </span>
              <em>{productMeta(item)}</em>
            </span>
            {item.id === product.id ? <Check size={15} aria-hidden="true" /> : null}
          </button>
        ))}
      </FloatingMenu>
    </div>
  );
}
