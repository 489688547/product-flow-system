import { DatabaseZap } from "lucide-react";
import { PageHeader } from "../../ui/PageHeader.jsx";

export function BrandContentPlaceholderPage({ title, description }) {
  return (
    <section className="page brand-content-page">
      <PageHeader title={title} description={description} />
      <section className="section-panel brand-content-placeholder" aria-label={`${title}建设状态`}>
        <DatabaseZap size={22} aria-hidden="true" />
        <div>
          <h2>页面能力正在接入</h2>
          <p>品牌内容主档已经使用独立数据边界；外部表现数据仍等待数据中心标准契约，不会用虚构数据替代生产结果。</p>
        </div>
      </section>
    </section>
  );
}
