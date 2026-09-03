import { cva, type VariantProps } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        soft: 'border-primary/20 bg-primary/10 text-primary'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
