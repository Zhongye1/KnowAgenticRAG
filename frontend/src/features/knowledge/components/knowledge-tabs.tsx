import { NavLink } from 'react-router';

import { paths } from '@/config/paths';
import { cn } from '@/utils/cn';

const KNOWLEDGE_TABS: ReadonlyArray<{
  label: string;
  href: string;
  end?: boolean;
}> = [
  { label: '知识库', href: paths.app.knowledge.kg.getHref() },
  { label: '技能', href: paths.app.knowledge.skills.getHref() },
  { label: '工具', href: paths.app.knowledge.tools.getHref() },
  { label: 'MCP', href: paths.app.knowledge.mcp.getHref() },
];

export function KnowledgeTabs() {
  return (
    <nav
      aria-label="知识库/技能二级导航"
      className="flex items-center gap-1 overflow-x-auto border-b border-color-border-2"
    >
      {KNOWLEDGE_TABS.map((tab) => (
        <NavLink
          key={tab.label}
          to={tab.href}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              'relative shrink-0 px-3 py-2 text-sm whitespace-nowrap transition-colors',
              isActive
                ? 'font-medium text-primary-6 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary-6'
                : 'text-color-text-2 hover:text-color-text-1',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
