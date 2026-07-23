export function externalActionMode(data = {}) {
  return data.dataEnvironment?.id === "display" ? "simulate" : "provider";
}

export function shouldSimulateExternalAction(data = {}) {
  return externalActionMode(data) === "simulate";
}
