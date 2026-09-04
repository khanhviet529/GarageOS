'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuSeparator = (): React.ReactElement => (
  <DropdownMenuPrimitive.Separator className="my-1 h-px bg-line" />
);

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-44 overflow-hidden rounded-md border border-line bg-ink-1 p-1 shadow-xl', className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-text',
      'outline-none data-[highlighted]:bg-ink-2 data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';
