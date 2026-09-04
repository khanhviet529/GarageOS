'use client';

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Category } from './api';

/*
 * Danh sách danh mục, kéo để đổi thứ tự hiển thị trên landing.
 *
 * 🔒 KÉO THẢ PHẢI CÓ ĐƯỜNG ĐI BẰNG BÀN PHÍM. `KeyboardSensor` cho phép Tab tới
 *    tay cầm, Space để nhấc, mũi tên để di chuyển, Space để thả. Một danh sách
 *    chỉ sắp xếp được bằng chuột là một danh sách người dùng bàn phím không
 *    sắp xếp được — và thứ tự này quyết định trang công khai trông ra sao.
 */
function Row({
  category,
  selected,
  onSelect,
}: {
  category: Category & { id: string };
  selected: boolean;
  onSelect: () => void;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0',
        selected && 'bg-ink-2',
        isDragging && 'relative z-10 rounded-md bg-ink-2 shadow-lg',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab rounded-sm p-1 text-text-muted transition-colors hover:text-text active:cursor-grabbing"
        aria-label={`Đổi thứ tự ${category.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13px] text-text">{category.name}</span>
        <span className="numeric block truncate text-[11px] text-text-muted">/{category.slug}</span>
      </button>

      <Badge tone={category.status === 'ACTIVE' ? 'ok' : 'neutral'}>
        {category.status === 'ACTIVE' ? 'Hiện' : 'Ẩn'}
      </Badge>
    </div>
  );
}

export function CategoryList({
  items,
  selectedId,
  onSelect,
  onReorder,
}: {
  items: (Category & { id: string })[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (next: (Category & { id: string })[]) => void;
}): React.ReactElement {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (over === null || active.id === over.id) return;
    const tu = items.findIndex((i) => i.id === active.id);
    const den = items.findIndex((i) => i.id === over.id);
    if (tu === -1 || den === -1) return;
    onReorder(arrayMove(items, tu, den));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col">
          {items.map((c) => (
            <Row key={c.id} category={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
