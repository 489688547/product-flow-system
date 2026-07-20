import { useEffect, useRef, useState } from "react";
import "quill/dist/quill.snow.css";

const IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 单图大小上限 2MB
const IMAGE_ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_ACCEPT = IMAGE_ALLOWED_TYPES.join(",");

export function RichTextEditor({ value, onChange, placeholder }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);
  const fileRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [imageError, setImageError] = useState("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current || quillRef.current) return;
    let cancelled = false;
    import("quill").then(({ default: Quill }) => {
      if (cancelled || !hostRef.current || quillRef.current) return;
      const editor = new Quill(hostRef.current, {
        theme: "snow",
        placeholder,
        modules: {
          toolbar: [["bold", "italic", "underline"], [{ list: "ordered" }, { list: "bullet" }], ["link", "image"], ["clean"]]
        }
      });
      const toolbar = editor.getModule("toolbar");
      toolbar.addHandler("image", () => fileRef.current?.click());
      editor.root.innerHTML = value || "";
      editor.on("text-change", () => onChangeRef.current(editor.root.innerHTML));
      quillRef.current = editor;
      setStatus("ready");
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => { cancelled = true; };
  }, [placeholder]);

  useEffect(() => {
    const editor = quillRef.current;
    if (!editor) return;
    if ((value || "") !== editor.root.innerHTML) editor.root.innerHTML = value || "";
  }, [value]);

  function insertImages(files) {
    const editor = quillRef.current;
    if (fileRef.current) fileRef.current.value = ""; // 允许再次选择同一文件
    if (!editor) return;
    const rejected = [];
    Array.from(files || []).forEach(file => {
      if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
        rejected.push(`「${file.name}」格式不支持，仅支持 PNG / JPEG / WebP / GIF`);
        return;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        rejected.push(`「${file.name}」超过 2MB 大小限制，请压缩后再插入`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const range = editor.getSelection(true) || { index: editor.getLength() };
        editor.insertEmbed(range.index, "image", reader.result);
      };
      reader.readAsDataURL(file);
    });
    setImageError(rejected.join("；"));
  }

  if (status === "error") {
    return (
      <div className="rich-field">
        <textarea
          value={value || ""}
          placeholder={placeholder}
          aria-label={placeholder || "富文本内容"}
          onChange={event => onChangeRef.current(event.target.value)}
          style={{ width: "100%", minHeight: 112, resize: "vertical", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-control)", padding: "8px 10px", background: "var(--surface)", color: "var(--text-primary)" }}
        />
        <small role="status" style={{ color: "var(--danger)", fontSize: 12 }}>富文本编辑器加载失败，已降级为纯文本编辑，内容将按原样保存。</small>
      </div>
    );
  }

  return (
    <div className="rich-field">
      {status === "loading" ? (
        <div role="status" style={{ minHeight: 150, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-control)", background: "var(--surface-subtle)", display: "grid", placeItems: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
          编辑器加载中…
        </div>
      ) : null}
      <div ref={hostRef} className="rich-editor" aria-hidden={status === "loading"} style={status === "loading" ? { position: "absolute", visibility: "hidden", height: 0, overflow: "hidden" } : undefined} />
      {imageError ? <small role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>{imageError}</small> : null}
      <input ref={fileRef} className="hidden" type="file" accept={IMAGE_ACCEPT} multiple aria-label="插入图片" onChange={event => insertImages(event.target.files)} />
    </div>
  );
}
