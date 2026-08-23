'use client';

import Link from '@tiptap/extension-link';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/react';
import type { RichTextDocumentV1 } from '@garageos/contracts';
import styles from './rich-text-editor.module.css';

export function RichTextEditor({ value, onChange, label = 'Nội dung' }: {
  value: RichTextDocumentV1;
  onChange: (next: RichTextDocumentV1) => void;
  label?: string;
}): React.ReactElement {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } }), Link.configure({ openOnClick: false, autolink: false })],
    content: value,
    editorProps: { attributes: { class: styles.editor ?? '', 'aria-label': label } },
    onUpdate: ({ editor: current }) => {
      onChange({ ...(current.getJSON() as Omit<RichTextDocumentV1, 'schemaVersion'>), schemaVersion: 1 });
    },
  });

  const toggleLink = (): void => {
    if (editor === null) return;
    const href = window.prompt('URL liên kết (https:// hoặc http://)');
    if (href === null) return;
    if (!/^https?:\/\/[^\s]+$/i.test(href)) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  return <div className={styles.root}>
    <div className={styles.toolbar} role="toolbar" aria-label={`${label}: định dạng`}>
      <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()} aria-label="In đậm"><b>B</b></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleItalic().run()} aria-label="In nghiêng"><i>I</i></button>
      <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()} aria-label="Danh sách">•</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()} aria-label="Danh sách có thứ tự">1.</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()} aria-label="Trích dẫn">“</button>
      <button type="button" onClick={toggleLink} aria-label="Liên kết">↗</button>
      <button type="button" onClick={() => editor?.chain().focus().undo().run()} aria-label="Hoàn tác">↶</button>
      <button type="button" onClick={() => editor?.chain().focus().redo().run()} aria-label="Làm lại">↷</button>
    </div>
    <EditorContent editor={editor} />
  </div>;
}
