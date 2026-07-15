import { useEffect, useRef } from "react";
import "quill/dist/quill.snow.css";

export function RichTextEditor({ value, onChange, placeholder }) {
  const hostRef = useRef(null);
  const quillRef = useRef(null);
  const fileRef = useRef(null);
  const onChangeRef = useRef(onChange);

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
    if (!editor) return;
    Array.from(files || []).filter(file => file.type.startsWith("image/")).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const range = editor.getSelection(true) || { index: editor.getLength() };
        editor.insertEmbed(range.index, "image", reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  return (
    <div className="rich-field">
      <div ref={hostRef} className="rich-editor" />
      <input ref={fileRef} className="hidden" type="file" accept="image/*" multiple aria-label="插入图片" onChange={event => insertImages(event.target.files)} />
    </div>
  );
}
