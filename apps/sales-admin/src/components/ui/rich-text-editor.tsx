'use client';

import type { RichTextDocumentV1 } from '@garageos/contracts';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold, Italic, Heading2, Heading3, List, ListOrdered, Quote, Link2, Undo2, Redo2,
} from 'lucide-react';
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/*
 * Trình soạn nội dung có cấu trúc.
 *
 * 🔒 INV-LS-10 — KHÔNG có chế độ "xem/sửa HTML". Nội dung sống dưới dạng tài
 *    liệu có cấu trúc (`RichTextDocumentV1`), và những gì người dùng tạo được
 *    giới hạn trong các nút trên thanh công cụ. Không có đường nào để một chuỗi
 *    đánh dấu thô đi từ ô nhập này ra tới trang công khai.
 *
 * 🔒 Liên kết chỉ nhận `http://` và `https://`. Chặn ở đây là chặn `javascript:`
 *    — một href như vậy biến mọi cú nhấp của khách thành một lần chạy mã trên
 *    chính tên miền của showroom.
 */
const NUT = [
  { key: 'bold', Icon: Bold, nhan: 'In đậm' },
  { key: 'italic', Icon: Italic, nhan: 'In nghiêng' },
  { key: 'h2', Icon: Heading2, nhan: 'Tiêu đề mức 2' },
  { key: 'h3', Icon: Heading3, nhan: 'Tiêu đề mức 3' },
  { key: 'bullet', Icon: List, nhan: 'Danh sách' },
  { key: 'ordered', Icon: ListOrdered, nhan: 'Danh sách có thứ tự' },
  { key: 'quote', Icon: Quote, nhan: 'Trích dẫn' },
  { key: 'link', Icon: Link2, nhan: 'Chèn liên kết' },
  { key: 'undo', Icon: Undo2, nhan: 'Hoàn tác' },
  { key: 'redo', Icon: Redo2, nhan: 'Làm lại' },
] as const;

export function RichTextEditor({
  value,
  onChange,
  label = 'Nội dung',
}: {
  value: RichTextDocumentV1;
  onChange: (next: RichTextDocumentV1) => void;
  label?: string;
}): React.ReactElement {
  const [moLink, setMoLink] = useState(false);
  const [href, setHref] = useState('https://');
  const [loiLink, setLoiLink] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          'min-h-44 px-3.5 py-3 text-[13px] text-text outline-none ' +
          '[&_a]:text-brand [&_a]:underline [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm ' +
          '[&_h3]:font-semibold [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3',
        'aria-label': label,
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange({ ...(current.getJSON() as Omit<RichTextDocumentV1, 'schemaVersion'>), schemaVersion: 1 });
    },
  });

  const chay = (key: (typeof NUT)[number]['key']): void => {
    if (editor === null) return;
    const c = editor.chain().focus();
    switch (key) {
      case 'bold': c.toggleBold().run(); break;
      case 'italic': c.toggleItalic().run(); break;
      case 'h2': c.toggleHeading({ level: 2 }).run(); break;
      case 'h3': c.toggleHeading({ level: 3 }).run(); break;
      case 'bullet': c.toggleBulletList().run(); break;
      case 'ordered': c.toggleOrderedList().run(); break;
      case 'quote': c.toggleBlockquote().run(); break;
      case 'undo': c.undo().run(); break;
      case 'redo': c.redo().run(); break;
      case 'link': setLoiLink(null); setMoLink(true); break;
    }
  };

  const datLink = (): void => {
    if (!/^https?:\/\/[^\s]+$/i.test(href)) {
      setLoiLink('Chỉ nhận liên kết bắt đầu bằng http:// hoặc https://');
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setMoLink(false);
    setHref('https://');
  };

  return (
    <div className="overflow-hidden rounded-md border border-line bg-ink-2">
      <div
        className="flex flex-wrap gap-0.5 border-b border-line p-1.5"
        role="toolbar"
        aria-label={`${label}: định dạng`}
      >
        {NUT.map(({ key, Icon, nhan }) => (
          <button
            key={key}
            type="button"
            onClick={() => chay(key)}
            aria-label={nhan}
            title={nhan}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-ink-3 hover:text-text"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      <EditorContent editor={editor} />

      <Dialog open={moLink} onOpenChange={setMoLink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chèn liên kết</DialogTitle>
            <DialogDescription>
              Chỉ nhận http:// và https://. Các lược đồ khác bị từ chối vì chúng chạy mã trên tên miền của
              showroom.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 px-5 py-4">
            <Label htmlFor="href-lien-ket">Địa chỉ</Label>
            <Input
              id="href-lien-ket"
              value={href}
              onChange={(e) => {
                setHref(e.target.value);
                setLoiLink(null);
              }}
              aria-invalid={loiLink !== null}
            />
            {loiLink !== null && <p className="text-[11px] text-danger">{loiLink}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoLink(false)}>
              Huỷ
            </Button>
            <Button onClick={datLink}>Chèn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
