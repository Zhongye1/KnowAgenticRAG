import { Link as RouterLink, LinkProps } from 'react-router';

import { cn } from '@/utils/cn';

export const Link = ({ className, children, ...props }: LinkProps) => {
  return (
    <RouterLink
      className={cn('text-color-text-2 hover:text-color-text-1', className)}
      {...props}
    >
      {children}
    </RouterLink>
  );
};
