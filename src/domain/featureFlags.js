const FLAG_ENV = {
  executiveCollaborationHub: "VITE_EXECUTIVE_COLLABORATION_HUB"
};

export function featureFlagEnabled(name, environment = import.meta.env || {}) {
  const envKey = FLAG_ENV[name];
  if (!envKey) return false;
  if (environment[envKey] === "true") return true;
  if (environment[envKey] === "false") return false;
  return Boolean(environment.DEV);
}
