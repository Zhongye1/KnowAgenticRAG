import * as React from 'react';

import { Head } from './head';

type ContentLayoutProps = {
  children: React.ReactNode;
  title: string;
  /**
   * 占满外壳内容区的高度（height: 100% 链）并去掉水平留白。
   *
   * 对话页这类「内部自己滚动、内容贴边」的页面需要一条不断的高度链；普通文档流
   * 页面保持默认（不设高度、保留留白），避免改动它们的滚动与排版语义。
   */
  fullHeight?: boolean;
};

export const ContentLayout = ({
  children,
  title,
  fullHeight = false,
}: ContentLayoutProps) => {
  return (
    <>
      <Head title={title} />
      <div style={fullHeight ? { height: '100%' } : undefined}>
        <div
          className={fullHeight ? undefined : 'mx-auto px-2 sm:px-6 md:px-8'}
          style={fullHeight ? { height: '100%' } : undefined}
        >
          {children}
        </div>
        {/* 底部留白只给文档流页面；fullHeight 的高度链上多这 32px 会让外壳滚出一条空白 */}
        {fullHeight ? null : <div className="h-8"></div>}
      </div>
    </>
  );
};
