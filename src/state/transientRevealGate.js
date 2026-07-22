export function createTransientRevealGate({ createController = () => new AbortController() } = {}) {
  let generation = 0;
  let controller = null;

  return {
    begin() {
      controller?.abort();
      controller = createController();
      generation += 1;
      return { generation, signal: controller.signal };
    },
    invalidate() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
    accepts(request, { active, hidden }) {
      return Boolean(request)
        && request.generation === generation
        && !request.signal.aborted
        && active === true
        && hidden !== true;
    }
  };
}
