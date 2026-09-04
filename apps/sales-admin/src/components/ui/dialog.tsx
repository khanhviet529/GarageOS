'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const Overlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60', className)} {...props} />
));
Overlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <Overlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
        'rounded-lg border border-line bg-ink-1 shadow-2xl',
        className,
      )}
      {...props}
    >
      {children}
      {/* Escape đóng overlay không phá huỷ; focus trả về phần tử mở — Radix lo. */}
      <DialogPrimitive.Close
        className="absolute right-4 top-4 rounded-sm text-text-muted transition-colors hover:text-text"
        aria-label="Đóng"
      >
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('border-b border-line px-5 py-4', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn('flex justify-end gap-2 border-t border-line px-5 py-3.5', className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-sm font-semibold text-text', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('mt-1 text-xs text-text-muted', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
