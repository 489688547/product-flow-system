import { managedChromeProfile } from "../../browser-runtime/managed-chrome.mjs";

export function createBrowserProfileRegistry({ rootDir }) {
  const profiles = new Map();

  return Object.freeze({
    register(store = {}) {
      const profile = managedChromeProfile({
        providerId: store.providerId,
        storeId: store.storeId,
        rootDir
      });
      const saved = {
        ...profile,
        storeName: String(store.storeName || "").trim().slice(0, 120)
      };
      profiles.set(profile.profileKey, saved);
      return saved;
    },
    list() {
      return [...profiles.values()];
    },
    listSafe() {
      return [...profiles.values()].map(profile => ({
        providerId: profile.providerId,
        storeId: profile.storeId,
        storeName: profile.storeName,
        profileKey: profile.profileKey
      }));
    }
  });
}
