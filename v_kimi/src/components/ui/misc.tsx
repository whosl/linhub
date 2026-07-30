"use client";

import * as React from "react";
import { Switch as SwitchPrimitive, Tabs as TabsPrimitive, Avatar as AvatarPrimitive, Select as SelectPrimitive, Popover as PopoverPrimitive } from "radix-ui";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------- Badge ----------

export function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        variant === "default" && "bg-primary/10 text-primary ring-primary/20",
        variant === "secondary" && "bg-secondary text-secondary-foreground ring-transparent",
        variant === "outline" && "text-muted-foreground ring-border",
        variant === "success" && "bg-success/10 text-success ring-success/20",
        variant === "warning" && "bg-warning/10 text-warning ring-warning/20",
        variant === "destructive" && "bg-destructive/10 text-destructive ring-destructive/20",
        className
      )}
      {...props}
    />
  );
}

// ---------- Separator ----------

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}

// ---------- Switch ----------

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-[image:var(--gradient-brand)] data-[state=checked]:shadow-[0_2px_8px_rgb(108_92_231/0.35)] data-[state=unchecked]:bg-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

// ---------- Avatar ----------

export function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-medium text-primary ring-1 ring-inset ring-primary/20",
        className
      )}
    >
      {src && <AvatarPrimitive.Image src={src} className="size-full object-cover" />}
      <AvatarPrimitive.Fallback delayMs={0}>
        {name.slice(0, 1).toUpperCase()}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

// ---------- Tabs ----------

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex h-9 w-full max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [scrollbar-width:none] sm:inline-flex sm:w-auto [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[var(--shadow-card)]",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-3 focus-visible:outline-none", className)}
      {...props}
    />
  );
}

// ---------- Select ----------

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  value?: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: React.ReactNode }[];
  placeholder?: string;
  className?: string;
}) {
  const emptyOptionValue = "__linhub_select_empty__";
  const hasEmptyOption = options.some((option) => option.value === "");
  const selectValue = hasEmptyOption && value === "" ? emptyOptionValue : value;

  return (
    <SelectPrimitive.Root
      value={selectValue}
      onValueChange={(nextValue) => {
        onValueChange(nextValue === emptyOptionValue ? "" : nextValue);
      }}
    >
      <SelectPrimitive.Trigger
        className={cn(
          "glow-focus flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-input bg-card px-3 text-sm shadow-xs transition-[border-color,box-shadow] focus:outline-none data-[placeholder]:text-muted-foreground",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="glass-strong z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-auto rounded-xl p-1 animate-in fade-in-0 zoom-in-95"
        >
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value === "" ? emptyOptionValue : o.value}
                className="relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-8 pr-3 text-sm outline-none transition-colors focus:bg-primary/10 data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex size-4 items-center justify-center text-primary">
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// ---------- Popover ----------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "glass-strong z-50 rounded-xl p-3 text-popover-foreground outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ---------- Skeleton ----------

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("skeleton", className)}
      {...props}
    />
  );
}

// ---------- Card ----------

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card text-card-foreground shadow-[var(--shadow-card)]",
        className
      )}
      {...props}
    />
  );
}

// ---------- EmptyState ----------

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed py-14 text-center animate-fade-up",
        className
      )}
    >
      {icon && <div className="mb-1 text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
