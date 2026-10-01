'use client';

import { ContentLayout } from './content-layout';

type PagePlaceholderProps = {
  title: string;
  description?: string;
};

export const PagePlaceholder = ({
  title,
  description,
}: PagePlaceholderProps) => {
  return (
    <ContentLayout title={title}>
      <div className="rounded-large border border-color-border-2 bg-color-bg-1 px-6 py-16 text-center">
        <p className="text-sm text-color-text-2">
          {description ?? '页面建设中，敬请期待。'}
        </p>
      </div>
    </ContentLayout>
  );
};
