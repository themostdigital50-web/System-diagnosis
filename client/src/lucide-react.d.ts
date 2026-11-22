/**
 * The installed lucide-react package does not ship its declaration bundle.
 * This local declaration covers the icons used by the dashboard without
 * weakening TypeScript checking elsewhere.
 */
declare module 'lucide-react' {
  import type { ComponentType, SVGProps } from 'react';

  export type LucideProps = SVGProps<SVGSVGElement> & {
    size?: number | string;
    strokeWidth?: number;
    absoluteStrokeWidth?: boolean;
  };

  export type LucideIcon = ComponentType<LucideProps>;

  export const Activity: LucideIcon;
  export const AlertTriangle: LucideIcon;
  export const ArrowDownRight: LucideIcon;
  export const ArrowLeft: LucideIcon;
  export const ArrowUpRight: LucideIcon;
  export const CheckCircle2: LucideIcon;
  export const Copy: LucideIcon;
  export const CircleGauge: LucideIcon;
  export const Clock3: LucideIcon;
  export const Cpu: LucideIcon;
  export const Download: LucideIcon;
  export const Globe2: LucideIcon;
  export const HardDrive: LucideIcon;
  export const Laptop: LucideIcon;
  export const LayoutDashboard: LucideIcon;
  export const Loader2: LucideIcon;
  export const LockKeyhole: LucideIcon;
  export const MemoryStick: LucideIcon;
  export const MonitorOff: LucideIcon;
  export const Network: LucideIcon;
  export const Pause: LucideIcon;
  export const Play: LucideIcon;
  export const Plus: LucideIcon;
  export const RefreshCw: LucideIcon;
  export const RotateCw: LucideIcon;
  export const Route: LucideIcon;
  export const Save: LucideIcon;
  export const Server: LucideIcon;
  export const Settings: LucideIcon;
  export const ShieldCheck: LucideIcon;
  export const SlidersHorizontal: LucideIcon;
  export const SquareTerminal: LucideIcon;
  export const Terminal: LucideIcon;
  export const TerminalSquare: LucideIcon;
  export const Trash2: LucideIcon;
  export const Upload: LucideIcon;
}
