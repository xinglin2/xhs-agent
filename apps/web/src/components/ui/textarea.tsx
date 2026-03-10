import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-xhs border border-gray-200 bg-xhs-gray px-4 py-3 text-sm',
          'placeholder:text-gray-400 text-xhs-dark',
          'focus:outline-none focus:ring-2 focus:ring-xhs-red/20 focus:border-xhs-red',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors resize-none',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

export { Textarea };
