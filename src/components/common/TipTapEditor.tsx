import React, { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { FiBold, FiImage, FiLink, FiSlash } from "react-icons/fi";

type TipTapEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rowsClassName?: string;
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  value,
  onChange,
  placeholder = "Typ hier...",
  rowsClassName = "min-h-[320px]",
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
      }),
      Image,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value || "",
    onUpdate({ editor: currentEditor }) {
      onChange(currentEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          `prose prose-sm max-w-none px-3 py-2 focus:outline-none [&_a]:text-blue-600 [&_a]:underline hover:[&_a]:text-blue-700 ${rowsClassName}`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (currentHtml !== value) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [editor, value]);

  const setLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Voer URL in", previousUrl ?? "");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const onImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const onImageSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;

    if (!file.type.startsWith("image")) {
      alert("Ongeldig bestandstype geselecteerd. Alleen afbeeldingen zijn toegestaan.");
      return;
    }

    const formData = new FormData();
    formData.append("media", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as {
        data: { url: string | string[] } | null;
        error: string | null;
      };

      const firstUrl = Array.isArray(json.data?.url)
        ? json.data?.url[0]
        : json.data?.url;

      if (!res.ok || json.error || !firstUrl) {
        throw new Error(json.error ?? "Afbeelding uploaden is mislukt.");
      }

      editor.chain().focus().setImage({ src: firstUrl }).run();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Afbeelding uploaden is mislukt.");
    } finally {
      event.target.value = "";
    }
  };

  if (!editor) return null;

  return (
    <div className="border border-gray-300 rounded-md bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 p-2">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Vet"
          aria-label="Vet"
          className={`px-2 py-1 rounded text-sm border ${
            editor.isActive("bold")
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          <FiBold className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={setLink}
          title="Link"
          aria-label="Link"
          className={`px-2 py-1 rounded text-sm border ${
            editor.isActive("link")
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          <FiLink className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onImageButtonClick}
          title="Afbeelding"
          aria-label="Afbeelding"
          className="px-2 py-1 rounded text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          <FiImage className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          title="Opmaak wissen"
          aria-label="Opmaak wissen"
          className="px-2 py-1 rounded text-sm border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          <FiSlash className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImageSelected}
      />

      <EditorContent editor={editor} />
    </div>
  );
};

export default TipTapEditor;
