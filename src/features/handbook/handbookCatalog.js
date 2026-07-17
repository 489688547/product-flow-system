import productContent from "../../../PRODUCT.md?raw";
import designContent from "../../../DESIGN.md?raw";
import { createHandbookDocument } from "../../domain/handbook.js";

export const DEFAULT_HANDBOOK_SLUG = "handbook/getting-started";

const markdownModules = import.meta.glob(
  [
    "../../../docs/handbook/*.md",
    "../../../docs/product/*.md",
    "../../../docs/platform/*.md",
    "../../../docs/superpowers/specs/*.md",
    "../../../docs/superpowers/plans/*.md"
  ],
  { eager: true, query: "?raw", import: "default" }
);

const CATEGORY_ORDER = { handbook: 0, product: 1, platform: 2 };
const KIND_ORDER = {
  guide: 0,
  product: 0,
  design: 1,
  specification: 2,
  plan: 3,
  platform: 0
};
const DEFAULT_UPDATED_AT = "2026-07-17";

const baseName = path => path.split("/").pop().replace(/\.md$/, "");

const updatedAtFromFileName = fileName => {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})-/);
  return match?.[1] ?? DEFAULT_UPDATED_AT;
};

const documentLocation = path => {
  const name = baseName(path);

  if (path.includes("/docs/handbook/")) {
    return { slug: `handbook/${name}`, category: "handbook", kind: "guide" };
  }
  if (path.includes("/docs/product/")) {
    return { slug: `product/${name}`, category: "product", kind: "product" };
  }
  if (path.includes("/docs/platform/")) {
    return { slug: `platform/${name}`, category: "platform", kind: "platform" };
  }
  if (path.includes("/docs/superpowers/specs/")) {
    return { slug: `product/specs/${name}`, category: "product", kind: "specification" };
  }

  return { slug: `product/plans/${name}`, category: "product", kind: "plan" };
};

const repositoryDocuments = Object.entries(markdownModules).map(([path, content]) => {
  const location = documentLocation(path);
  return createHandbookDocument({
    ...location,
    updatedAt: updatedAtFromFileName(baseName(path)),
    content
  });
});

const rootDocuments = [
  createHandbookDocument({
    slug: "product/product",
    category: "product",
    kind: "product",
    updatedAt: DEFAULT_UPDATED_AT,
    content: productContent
  }),
  createHandbookDocument({
    slug: "product/design",
    category: "product",
    kind: "design",
    updatedAt: DEFAULT_UPDATED_AT,
    content: designContent
  })
];

export const handbookDocuments = [...repositoryDocuments, ...rootDocuments].sort((left, right) => (
  CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category]
  || KIND_ORDER[left.kind] - KIND_ORDER[right.kind]
  || left.title.localeCompare(right.title, "zh-CN")
));
