import { useEffect, useMemo } from "react";
import { buildProductPlatformEvents } from "../../domain/productPlatformAdapter.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";

export function ProductFlowPlatformBridge() {
  const { state: productState } = useProductFlow();
  const { dispatch } = usePlatform();
  const events = useMemo(() => buildProductPlatformEvents(productState, new Date()), [productState]);
  const signature = events.map(event => event.idempotencyKey).join("|");

  useEffect(() => {
    if (events.length) dispatch({ type: "ingest_app_events", events });
  }, [dispatch, signature]);

  return null;
}
