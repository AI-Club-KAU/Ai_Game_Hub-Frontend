import * as React from "react";
import { cn } from "@/lib/utils";
function Input({ className, type, ...props }: React.ComponentProps<"input">) { return <input type={type} data-slot="input" className={cn("flex h-14 w-full min-w-0 rounded-xl border border-input bg-background px-4 py-3 text-base text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive", className)} {...props} />; }
export { Input };