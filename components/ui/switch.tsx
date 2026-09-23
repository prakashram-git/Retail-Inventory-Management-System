"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4.5 w-7.5 shrink-0 items-center rounded-full border border-transparent bg-input p-0.5 shadow-none transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary dark:bg-input/80",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-3 data-unchecked:translate-x-0 dark:bg-foreground dark:data-unchecked:bg-foreground/60"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
