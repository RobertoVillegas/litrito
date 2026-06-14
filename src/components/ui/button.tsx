import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#/lib/utils'

// Variants map onto the existing `.btn-pill` design-system classes so the
// primitive stays visually identical to the rest of the app.
export const buttonVariants = cva('btn-pill disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      primary: 'btn-pill--primary',
      outline: 'btn-pill--outline-dark',
      'outline-red': 'btn-pill--outline-red',
    },
    fullWidth: {
      true: 'w-full',
    },
  },
  defaultVariants: {
    variant: 'primary',
  },
})

export type ButtonProps = useRender.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

// Pass `render` to compose with another element (e.g. a router Link) while
// keeping the button styling and accessibility, the base-ui way:
//   <Button render={<Link to="/registro" />} variant="outline">…</Button>
export function Button({ render, className, variant, fullWidth, type, ...props }: ButtonProps) {
  return useRender({
    render: render ?? <button type={type ?? 'button'} />,
    props: {
      className: cn(buttonVariants({ variant, fullWidth }), className),
      ...props,
    },
  })
}
