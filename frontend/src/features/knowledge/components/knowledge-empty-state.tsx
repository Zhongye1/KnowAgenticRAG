import * as React from 'react';

type KnowledgeEmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function KnowledgeEmptyState({
  icon,
  title,
  description,
  children,
}: KnowledgeEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-large border border-dashed border-color-border-2 bg-color-bg-1 px-6 py-16 text-center">
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-large bg-primary-6/10 text-primary-6">
          {icon}
        </div>
      ) : null}
      <h3 className="text-sm font-medium text-color-text-1">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs text-color-text-2">{description}</p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
