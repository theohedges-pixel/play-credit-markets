import { useIsOnline } from "@/lib/presence";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username: string | null | undefined;
  avatarUrl?: string | null;
  userId?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  showPresence?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-24 w-24 text-2xl",
};

const dotMap = {
  sm: "h-1.5 w-1.5 right-0 bottom-0",
  md: "h-2 w-2 right-0 bottom-0",
  lg: "h-2.5 w-2.5 right-0 bottom-0",
  xl: "h-4 w-4 right-1 bottom-1",
};

export function UserAvatar({
  username,
  avatarUrl,
  userId,
  size = "md",
  showPresence = true,
  className,
}: UserAvatarProps) {
  const online = useIsOnline(userId);
  const initials = (username ?? "?").slice(0, 2).toUpperCase();
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={username ?? ""}
          className={cn(
            "rounded-full object-cover bg-secondary border border-border",
            sizeMap[size],
          )}
        />
      ) : (
        <span
          className={cn(
            "rounded-full bg-secondary text-foreground/70 font-display font-semibold inline-flex items-center justify-center border border-border",
            sizeMap[size],
          )}
        >
          {initials}
        </span>
      )}
      {showPresence && online && (
        <span
          className={cn(
            "absolute rounded-full bg-yes ring-2 ring-background",
            dotMap[size],
          )}
          title="Online"
        />
      )}
    </span>
  );
}
