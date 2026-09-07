'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/*
 * 🔒 Mọi màu ở đây là token của dự án qua lớp ánh xạ trong `globals.css`.
 *    Không có giá trị màu viết thẳng.
 */
const variants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-action text-text-on-action hover:bg-action-hover',
        secondary: 'border border-line-strong bg-transparent text-text hover:bg-ink-2',
        soft: 'bg-ink-2 text-text hover:bg-ink-3',
        ghost: 'text-text-muted hover:bg-ink-2 hover:text-text',
        danger: 'bg-danger text-ink-0 hover:opacity-90',
      },
      size: {
        md: 'h-[34px] px-3.5',
        sm: 'h-[28px] px-2.5 text-xs',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(variants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { variants as buttonVariants };
