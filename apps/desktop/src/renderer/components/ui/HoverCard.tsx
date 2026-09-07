import * as HoverCardPrimitive from "@radix-ui/react-hover-card";
import * as React from "react";

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;
const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className = "", sideOffset = 8, collisionPadding = 12, ...props }, ref) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content ref={ref} sideOffset={sideOffset} collisionPadding={collisionPadding}
      className={`z-[200] max-w-[calc(100vw-24px)] rounded-act-md border border-line bg-surface-raised p-3 text-[12px] font-normal leading-5 text-text-main shadow-act-popover ${className}`} {...props} />
  </HoverCardPrimitive.Portal>
));
HoverCardContent.displayName = "HoverCardContent";

export { HoverCard, HoverCardTrigger, HoverCardContent };
