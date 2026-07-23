export function trySetStorageItem(storage, key, value) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function tryRemoveStorageItem(storage, key) {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function persistLocalState(storage, key, state) {
  return trySetStorageItem(storage, key, JSON.stringify(state));
}
