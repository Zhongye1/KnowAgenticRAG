import { cn } from "@/lib/utils"
import { SpinnerIcon } from "@phosphor-icons/react"

// 兼容旧用法 size="lg"/"xl"，尺寸映射沿用迁移前的组件
const SPINNER_SIZE_CLASSES = {
  sm: "size-4",
  md: "size-8",
  lg: "size-16",
  xl: "size-24",
} as const

function Spinner({
  className,
  size = "sm",
  ...props
}: React.ComponentProps<"svg"> & {
  size?: keyof typeof SPINNER_SIZE_CLASSES
}) {
  return (
    <SpinnerIcon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("animate-spin", SPINNER_SIZE_CLASSES[size], className)}
      {...props}
    />
  )
}

export { Spinner }
