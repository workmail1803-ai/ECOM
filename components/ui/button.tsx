import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-card",
        secondary:
          "bg-ink text-white hover:bg-ink-soft active:bg-ink",
        outline:
          "border border-line-strong bg-surface text-ink hover:bg-surface-sunken",
        ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink",
        danger: "bg-danger text-white hover:opacity-90",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-[13px] [&_svg]:size-4",
        md: "h-10 px-4 [&_svg]:size-4",
        lg: "h-12 px-6 text-[15px] [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows a spinner and blocks input. Use for pending server actions. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild, loading, children, disabled, ...props },
    ref,
  ) => {
    // `asChild` renders a Link — Slot requires exactly one child, so the
    // spinner branch is only available on a real <button>.
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, block, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={cn(buttonVariants({ variant, size, block, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
