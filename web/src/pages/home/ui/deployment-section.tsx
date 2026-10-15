/**
 * 私有化部署段：部署与存储 / 空间与资源权限 / 审计与运行监控。三段并列，无入口链接。
 *
 * 事实来源：`scripts/init.sh`（生成 `.env` 里的 JWT / API Key / 实例密钥并要求模型 API Key）与
 * `docker-compose.yml` 部署拓扑、模型供应商在管理界面按 `provider_type` + `base_url` 增删改
 * （`ars/models/providers/builtin.py`）、对象存储走 S3 协议（`ars/storage/minio/client.py`）、
 * 三级角色与共享范围（`ars/permissions/resource_permission.py`：`global / department / user`
 * × `read / manage`）、Dashboard 全平台会话审计表（`server/routers/dashboard_router.py`）、
 * 任务中心面板（`web/src/features/task-center`）、Langfuse 追踪（`ars/services/langfuse_service.py`）。
 *
 * 刻意不写四件对不上实现的事：向量库只有 Milvus 一种实现（换引擎要写新 `KnowledgeBase` 子类）、
 * API Key 没有能力/知识库范围（权限等于绑定账号）、OIDC 前端回调页仍是占位（后端完整）、
 * 域名白名单只盖知识库 URL 抓取与远程技能来源。改这几句前先看
 * decisions/implemented/2026-10-15-home-static-and-design-system.md 第 19 条。
 *
 * 图标：部署列用本文件的 `DockerMark`（simple-icons 的官方 glyph），另外两列仍是 lucide。
 */
import { ChartLine, ShieldCheck } from 'lucide-react';
import type { ComponentType } from 'react';

/** 三列图标共用的 props 形状：lucide 图标与下面的本地品牌标都按它取用。 */
type PillarIconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
};

/**
 * Docker 品牌标：官方 glyph 单路径（simple-icons，CC0），`fill: currentColor` 跟随 `--ink`，
 * 与同列的 lucide 图标共用 `home-icon` 的尺寸槽。两个图标包都没有 Docker（lucide 不含品牌标、
 * `@lobehub/icons` 没有该品牌），因此本地内联。
 */
const DockerMark = ({ className, size = 30 }: PillarIconProps) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z" />
  </svg>
);

type Pillar = {
  title: string;
  Icon: ComponentType<PillarIconProps>;
  body: string;
};

const PILLARS: readonly Pillar[] = [
  {
    title: '部署与存储',
    Icon: DockerMark,
    body: '支持 Docker Compose 部署。模型供应商在管理界面增删改，可接入自建 OpenAI 兼容服务；对象存储走 S3 协议。',
  },
  {
    title: '空间与资源权限',
    Icon: ShieldCheck,
    body: '超级管理员、管理员与普通用户三级角色。会话与文件按账号隔离，知识库和 Agent 可按全局、部门或个人范围共享。',
  },
  {
    title: '审计与运行监控',
    Icon: ChartLine,
    body: '超级管理员可筛查全平台会话审计，任务中心实时展示后台任务排队与运行状态；接入 Langfuse 可追踪每次执行。',
  },
];

export const DeploymentSection = () => (
  <section
    id="deployment"
    className="home-band home-band-sunken"
    aria-labelledby="deployment-title"
  >
    <div className="home-shell">
      <p className="home-eyebrow mb-4">05 / BUILT FOR YOUR TEAM</p>

      <div className="home-band-head flex flex-wrap items-end justify-between gap-x-[clamp(24px,4vw,72px)] gap-y-4">
        <h2 id="deployment-title" className="home-title max-w-[16em]">
          本地部署，
          <br />
          <em>一键初始化与启动</em>
        </h2>
        <p className="home-body max-w-[26em]">
          准备 Docker 与模型 API。初始化脚本生成本地配置，Compose 启动知识库、图谱、API 与 Worker。
        </p>
      </div>

      <div className="home-cols grid grid-cols-3 max-[1024px]:grid-cols-1">
        {PILLARS.map(({ title, Icon, body }) => (
          <div className="pt-[clamp(24px,2.6vw,40px)]" key={title}>
            <Icon
              className="home-icon"
              size={30}
              strokeWidth={1.5}
              aria-hidden
            />
            <h3 className="home-subtitle mt-[clamp(22px,2.2vw,32px)]">
              {title}
            </h3>
            <p className="home-body mt-[clamp(12px,1.4vw,18px)]">{body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
