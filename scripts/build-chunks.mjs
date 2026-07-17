export const MAX_CHUNK_BYTES = 500_000;

const REACT_RUNTIME_PACKAGES = ["react", "react-dom", "scheduler"];
const MARKDOWN_RUNTIME_PACKAGES = ["react-markdown", "remark-gfm", "rehype-slug", "unified"];

const includesPackage = (id, packageName) => id.includes(`/node_modules/${packageName}/`);

export function manualChunks(moduleId) {
  const normalizedId = moduleId.replaceAll("\\", "/");
  if (REACT_RUNTIME_PACKAGES.some(packageName => includesPackage(normalizedId, packageName))) {
    return "react-vendor";
  }
  if (MARKDOWN_RUNTIME_PACKAGES.some(packageName => includesPackage(normalizedId, packageName))) {
    return "markdown-vendor";
  }
  return undefined;
}

export function findOversizedChunks(files, limitBytes = MAX_CHUNK_BYTES) {
  return files.filter(file => file.name.endsWith(".js") && file.size > limitBytes);
}
