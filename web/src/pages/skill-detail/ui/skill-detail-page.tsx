/**
 * 技能详情页（`/extensions/skill/:slug`）。
 *
 * 独立页面 + `ContentLayout`；地址里缺少 slug 时给占位提示。
 */
import { useParams } from 'react-router';

import { SkillDetailView } from '@/features/skills';
import { ContentLayout } from '@/shared/ui/content-layout';
import { PagePlaceholder } from '@/shared/ui/page-placeholder';

export const SkillDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return <PagePlaceholder title="技能" description="地址里缺少技能 slug。" />;
  }

  return (
    <ContentLayout title="技能详情">
      {/* 换 slug 时重挂载：文件选择、展开态与表单都是某个技能的 */}
      <SkillDetailView key={slug} slug={slug} />
    </ContentLayout>
  );
};
