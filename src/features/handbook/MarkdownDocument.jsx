import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";

const isExternalLink = href => /^https?:\/\//i.test(href ?? "");

export function MarkdownDocument({ content }) {
  return (
    <div className="handbook-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug]}
        components={{
          h1: () => null,
          a: ({ href, children, ...props }) => isExternalLink(href)
            ? <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>
            : <a {...props} href={href}>{children}</a>,
          table: ({ children, ...props }) => (
            <div className="handbook-table-wrap">
              <table {...props}>{children}</table>
            </div>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
