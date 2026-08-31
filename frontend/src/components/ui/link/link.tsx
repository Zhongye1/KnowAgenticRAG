import { Link as RouterLink, LinkProps } from 'react-router';

import { cn } from '@/utils/cn';

export const Link = ({
  className,
  children,
  viewTransition = true,
  ...props
}: LinkProps) => {
  return (
    <RouterLink
      viewTransition={viewTransition}
      className={cn('text-color-text-2 hover:text-color-text-1', className)}
      {...props}
    >
      {children}
    </RouterLink>
  );
};
