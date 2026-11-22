import { MonitorOff, Terminal } from 'lucide-react';
import { Card } from '../components/ui';

export function Unsupported() {
  return (
    <div className="grid min-h-screen place-items-center bg-base px-4">
      <Card title="Desktop computers only" subtitle="Windows and Linux are supported" className="w-full max-w-xl">
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <p className="flex items-start gap-3">
            <MonitorOff size={18} className="mt-0.5 shrink-0 text-warn" />
            A web page cannot read the real operating system, CPU, memory, disks, or network interfaces of the device
            viewing it. That is a browser security rule, not a SystemScope setting.
          </p>
          <p>
            To see accurate information, open this dashboard on a <span className="text-text">Windows or Linux
            computer</span> that is running the SystemScope device agent. Phones, tablets, and macOS are not supported.
          </p>
          <div className="rounded border border-border bg-surface-2 p-3 font-mono text-xs text-text">
            <div className="mb-2 flex items-center gap-2 text-muted"><Terminal size={14} /> On the computer you want to monitor:</div>
            <div className="break-all">node server/dist/agent/index.js setup &lt;server-url&gt; &lt;device-id&gt; &lt;device-token&gt;</div>
            <div className="break-all">node server/dist/agent/index.js run</div>
          </div>
          <p className="text-[11px]">
            Enroll each computer from the <span className="text-text">Devices</span> page to receive its one-time ID
            and token.
          </p>
        </div>
      </Card>
    </div>
  );
}
