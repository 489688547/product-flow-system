import { Plus, Store } from "lucide-react";
import douyinLogo from "../../../assets/connectors/douyin.svg";

export function DouyinStoreCard({
  definition,
  stores = [],
  canAdd = false,
  onAdd
}) {
  const connectedStores = stores.filter(store => (
    store.providerId === "douyin-ecommerce" && store.status !== "disabled"
  ));

  return (
    <article className="connector-card douyin-store-card">
      <div className="connector-card-head">
        <img src={douyinLogo} alt="" aria-hidden="true" />
        <div><strong>{definition.name}</strong><span>{definition.description}</span></div>
      </div>
      {connectedStores.length ? (
        <ul className="douyin-store-list" aria-label="已添加的抖音店铺">
          {connectedStores.map(store => (
            <li key={store.storeId}>
              <Store size={16} aria-hidden="true" />
              <span><b>{store.storeName}</b><small>店铺 ID {store.storeId}</small></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="douyin-store-empty">尚未添加店铺</p>
      )}
      <button
        className="connector-add-action"
        type="button"
        disabled={!canAdd}
        title={!canAdd ? "仅总经办可添加店铺" : undefined}
        onClick={onAdd}
      >
        <Plus size={15} aria-hidden="true" />添加
      </button>
    </article>
  );
}
