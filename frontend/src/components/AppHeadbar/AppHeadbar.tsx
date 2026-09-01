import {
  ArrowSquareOut,
  GearSix,
  GithubLogo,
  Question,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useMatches } from 'react-router';

import { paths } from '@/config/paths';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { DayNightSwitcher } from '@/components/ui/DayNightSwitcher';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const GITHUB_URL = 'https://github.com/Zhongye1/KnowledgeRAG-OGAS';

type Language = 'zh' | 'en';

function SettingsDrawer() {
  const [language, setLanguage] = useState<Language>('zh');

  return (
    <Drawer direction="right">
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="打开设置">
              <GearSix className="size-4" />
            </Button>
          </DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>设置</TooltipContent>
      </Tooltip>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>设置</DrawerTitle>
          <DrawerDescription>管理应用的外观、语言等偏好。</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-6 p-4">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">外观</h3>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                日间 / 夜间模式
              </span>
              <DayNightSwitcher />
            </div>
          </section>
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">语言</h3>
            <div className="flex gap-2">
              {(
                [
                  { value: 'zh', label: '简体中文' },
                  { value: 'en', label: 'English' },
                ] as const
              ).map((option) => (
                <Button
                  key={option.value}
                  variant={language === option.value ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={language === option.value}
                  onClick={() => setLanguage(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const HELP_LINKS = [
  {
    title: '项目仓库',
    description: '查看源码并 Star 支持本项目',
    href: GITHUB_URL,
  },
  {
    title: '项目文档',
    description: '阅读 README 与使用说明',
    href: `${GITHUB_URL}#readme`,
  },
  {
    title: '问题反馈',
    description: '在 GitHub Issues 提交 Bug 或建议',
    href: `${GITHUB_URL}/issues`,
  },
] as const;

function HelpDrawer() {
  return (
    <Drawer direction="right">
      <Tooltip>
        <TooltipTrigger asChild>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="打开帮助">
              <Question className="size-4" />
            </Button>
          </DrawerTrigger>
        </TooltipTrigger>
        <TooltipContent>帮助</TooltipContent>
      </Tooltip>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>帮助</DrawerTitle>
          <DrawerDescription>了解项目、查阅文档或提交反馈。</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 p-4">
          {HELP_LINKS.map((link) => (
            <a
              key={link.title}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-3 rounded-md border border-border bg-background p-3 transition-colors hover:bg-muted hover:text-foreground"
            >
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  {link.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {link.description}
                </span>
              </div>
              <ArrowSquareOut className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function AppHeadbar() {
  const matches = useMatches();
  const last = matches[matches.length - 1];
  const title = (last?.handle as { title?: string } | undefined)?.title;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink asChild>
                <Link to={paths.app.dashboard.getHref()}>Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {title ? (
              <>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : null}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-1 px-4">
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                asChild
                aria-label="GitHub 项目仓库"
              >
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GithubLogo className="size-4" weight="fill" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>GitHub 项目仓库</TooltipContent>
          </Tooltip>

          <SettingsDrawer />
          <HelpDrawer />
        </TooltipProvider>

        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <DayNightSwitcher />
      </div>
    </header>
  );
}
