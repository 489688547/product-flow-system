export function ProductOwnershipBadge({ owned }) {
  return owned ? <span className="product-ownership-badge">我负责</span> : null;
}
