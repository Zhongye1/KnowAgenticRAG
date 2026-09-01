import * as React from 'react';

import { Head } from '../seo';

type ContentLayoutProps = {
  children: React.ReactNode;
  title: string;
};

export const ContentLayout = ({ children, title }: ContentLayoutProps) => {
  return (
    <>
      <Head title={title} />
      <div>
        <div className="mx-auto px-2 sm:px-6 md:px-8">{children}</div>
      </div>
    </>
  );
};
