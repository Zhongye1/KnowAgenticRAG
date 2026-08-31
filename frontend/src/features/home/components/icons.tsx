import {
  BarChart3,
  Box,
  Cpu,
  Database,
  GitFork,
  Key,
  Layers,
  Plug,
  Rocket,
  Scan,
  Share2,
  Shield,
  Sparkles,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import type { IconName } from '../content';

const iconMap: Record<IconName, LucideIcon> = {
  box: Box,
  sparkles: Sparkles,
  plug: Plug,
  wrench: Wrench,
  fork: GitFork,
  layers: Layers,
  cpu: Cpu,
  database: Database,
  share: Share2,
  scan: Scan,
  shield: Shield,
  key: Key,
  rocket: Rocket,
  chart: BarChart3,
};

export const FeatureIcon = ({
  name,
  size = 22,
}: {
  name: IconName;
  size?: number;
}) => {
  const Icon = iconMap[name];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
};
