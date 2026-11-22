import os from 'node:os';
import type { Field, GpuDevice } from '../types';
import { ok, unavailable } from '../types';
import { asArray, powerShellJson, readFileSafe, runCommand } from '../lib/exec';

interface OsVersionInfo {
  name: string;
  version: string;
  build: string;
}

interface RouteRow {
  DestinationPrefix?: string;
  NextHop?: string;
  InterfaceIndex?: number;
}

interface AdapterRow {
  Name?: string;
  InterfaceIndex?: number;
  InterfaceType?: number | string;
  MediaType?: string;
  Status?: string;
  LinkSpeed?: string;
}

interface DnsRow {
  InterfaceAlias?: string;
  ServerAddresses?: string[];
}

interface GpuRow {
  Name?: string;
  DriverVersion?: string;
  AdapterRAM?: number;
}

interface CounterRow {
  Name?: string;
  ReceivedBytes?: number;
  SentBytes?: number;
}

export interface AdapterCounter {
  name: string;
  rxBytes: number;
  txBytes: number;
}

export interface GatewayInfo {
  ipv4: Field<string>;
  ipv6: Field<string>;
  interfaceName: Field<string>;
}

const firstText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

interface WindowsStaticFacts {
  os?: OsVersionRow | OsVersionRow[];
  cpu?: { NumberOfCores?: number } | Array<{ NumberOfCores?: number }>;
  gpu?: GpuRow | GpuRow[];
}

/**
 * PowerShell startup dominates first-load latency. These three facts are
 * static for the life of the machine, so collect them in one process once.
 */
let staticFactsPromise: Promise<WindowsStaticFacts | null> | null = null;

export function getWindowsStaticFacts(): Promise<WindowsStaticFacts | null> {
  if (os.platform() !== 'win32') return Promise.resolve(null);
  if (!staticFactsPromise) {
    staticFactsPromise = powerShellJson<WindowsStaticFacts>(
      '$os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber; ' +
        '$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 NumberOfCores; ' +
        '$gpu = Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM; ' +
        '[pscustomobject]@{ os = $os; cpu = $cpu; gpu = @($gpu) }',
      20_000,
    ).catch(() => {
      // Allow a later request to retry instead of caching a permanent failure.
      staticFactsPromise = null;
      return null;
    });
  }
  return staticFactsPromise;
}

interface IpConfigSection {
  name: string;
  description: string;
  ipv4: string[];
  gateways: string[];
  dns: string[];
}

interface WindowsNetworkFacts {
  gateways: GatewayInfo;
  dns: Field<string[]>;
  adapters: AdapterRow[];
}

function parseIpConfig(text: string): IpConfigSection[] {
  const sections: IpConfigSection[] = [];
  let current: IpConfigSection | null = null;
  let lastKey = '';

  const addAddress = (target: string[], raw: string) => {
    for (const item of raw.split(/[,\s]+/)) {
      const value = item.replace(/\(.*?\)/g, '').trim();
      if (value && /^[\da-f:./]+$/i.test(value) && !target.includes(value)) target.push(value);
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*(?:[^\s:]+(?:\s+[^\s:]+)*\s+)?adapter\s+(.+):\s*$/i.exec(line);
    if (header) {
      current = { name: header[1].trim(), description: '', ipv4: [], gateways: [], dns: [] };
      sections.push(current);
      lastKey = '';
      continue;
    }
    if (!current) continue;

    const match = /^\s{2,}(.+?)\s*[. ]{2,}:\s*(.*)$/.exec(line);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      lastKey = key;
      if (/^Description$/i.test(key)) current.description = value;
      else if (/^IPv4 Address/i.test(key)) addAddress(current.ipv4, value);
      else if (/^Default Gateway/i.test(key)) addAddress(current.gateways, value);
      else if (/^DNS Servers/i.test(key)) addAddress(current.dns, value);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed || !lastKey || !/^(DNS Servers|Default Gateway)/i.test(lastKey)) continue;
    if (!/^[\da-f:./]+$/i.test(trimmed)) continue;
    const target = /^DNS Servers/i.test(lastKey) ? current.dns : current.gateways;
    if (!target.includes(trimmed)) target.push(trimmed);
  }

  return sections;
}

let networkFactsEntry: { at: number; promise: Promise<WindowsNetworkFacts | null> } | null = null;

/**
 * `ipconfig /all` returns adapters, gateways and DNS in one fast native call.
 * PowerShell net cmdlets take tens of seconds on some Windows machines.
 */
export async function getWindowsNetworkFacts(): Promise<WindowsNetworkFacts | null> {
  if (os.platform() !== 'win32') return null;
  const now = Date.now();
  if (networkFactsEntry && now - networkFactsEntry.at < 15_000) return networkFactsEntry.promise;

  const promise = (async () => {
    const result = await runCommand('ipconfig', ['/all'], 5000);
    if (result.exitCode !== 0 || !result.stdout) return null;

    const sections = parseIpConfig(result.stdout);
    const active =
      sections.find((section) => section.gateways.length > 0 && section.ipv4.length > 0 && !/loopback|npcap|wsl|virtual/i.test(section.name)) ??
      sections.find((section) => section.gateways.length > 0) ??
      sections[0] ??
      null;

    const ipv4Gateway = active?.gateways.find((gateway) => gateway.includes('.') && !gateway.includes(':'));
    const ipv6Gateway = active?.gateways.find((gateway) => gateway.includes(':'));
    const dnsServers = [...new Set(sections.flatMap((section) => section.dns))].filter(
      (server) => !/^fec0:/i.test(server),
    );

    return {
      gateways: {
        ipv4: ipv4Gateway ? ok(ipv4Gateway) : unavailable<string>('Default IPv4 gateway not found'),
        ipv6: ipv6Gateway ? ok(ipv6Gateway) : unavailable<string>('Default IPv6 gateway not found'),
        interfaceName: active?.name
          ? ok(active.name)
          : unavailable<string>('Active interface not detected'),
      },
      dns: dnsServers.length > 0 ? ok(dnsServers) : unavailable<string[]>('No DNS servers reported'),
      adapters: sections.map((section) => {
        const wireless = /wi-?fi|wireless|802\.11/i.test(`${section.name} ${section.description}`);
        return {
          Name: section.name,
          InterfaceType: wireless ? 71 : 6,
          MediaType: wireless ? 'Native 802.11' : '802.3',
          Status: 'Up',
          LinkSpeed: '',
        };
      }),
    } satisfies WindowsNetworkFacts;
  })();

  networkFactsEntry = { at: now, promise };
  return promise;
}

function hexGatewayToIpv4(hex: string): string | null {
  try {
    const bytes = hex.match(/.{2}/g)?.reverse().map((pair) => parseInt(pair, 16)) ?? [];
    if (bytes.length !== 4 || bytes.some((b) => Number.isNaN(b))) return null;
    return bytes.join('.');
  } catch {
    return null;
  }
}

export async function getOsVersionInfo(): Promise<Field<OsVersionInfo>> {
  try {
    if (os.platform() === 'win32') {
      const rows = asArray((await getWindowsStaticFacts())?.os ?? null);
      const row = rows[0];
      if (row?.Caption) {
        return ok({
          name: row.Caption,
          version: firstText(row.Version) ?? os.release(),
          build: firstText(row.BuildNumber) ?? 'unavailable',
        });
      }
    } else if (os.platform() === 'darwin') {
      const [name, version, build] = await Promise.all([
        runCommand('sw_vers', ['-productName'], 4000),
        runCommand('sw_vers', ['-productVersion'], 4000),
        runCommand('sw_vers', ['-buildVersion'], 4000),
      ]);
      if (name.exitCode === 0 && name.stdout) {
        return ok({
          name: name.stdout,
          version: version.stdout || os.release(),
          build: build.stdout || 'unavailable',
        });
      }
    } else {
      const release = await readFileSafe('/etc/os-release');
      if (release) {
        const values = new Map<string, string>();
        for (const line of release.split(/\r?\n/)) {
          const match = /^([A-Z_]+)="?([^"\n]*)"?$/.exec(line);
          if (match) values.set(match[1], match[2]);
        }
        const name = values.get('PRETTY_NAME') ?? values.get('NAME');
        if (name) {
          return ok({ name, version: values.get('VERSION_ID') ?? os.release(), build: os.release() });
        }
      }
    }
  } catch {
    // Fall through to the kernel-only value below.
  }
  return unavailable('Friendly OS name could not be read from the operating system');
}

interface OsVersionRow {
  Caption?: string;
  Version?: string;
  BuildNumber?: string;
}

export async function getPhysicalCores(): Promise<Field<number>> {
  try {
    if (os.platform() === 'win32') {
      const rows = asArray((await getWindowsStaticFacts())?.cpu ?? null);
      const cores = rows[0]?.NumberOfCores;
      if (typeof cores === 'number' && cores > 0) return ok(cores);
    } else if (os.platform() === 'darwin') {
      const result = await runCommand('sysctl', ['-n', 'hw.physicalcpu'], 4000);
      const cores = Number(result.stdout);
      if (Number.isInteger(cores) && cores > 0) return ok(cores);
    } else {
      const cpuinfo = await readFileSafe('/proc/cpuinfo');
      if (cpuinfo) {
        const physicalIds = new Set<string>();
        const coreIds = new Set<string>();
        let reported = 0;
        for (const line of cpuinfo.split(/\r?\n/)) {
          const match = /^([a-z_]+)\s*:\s*(.+)$/.exec(line);
          if (!match) continue;
          if (match[1] === 'physical id') physicalIds.add(match[2].trim());
          if (match[1] === 'core id') coreIds.add(match[2].trim());
          if (match[1] === 'cpu cores' && reported === 0) reported = Number(match[2].trim());
        }
        const detected = physicalIds.size > 0 && coreIds.size > 0 ? coreIds.size / physicalIds.size : reported;
        if (Number.isInteger(detected) && detected > 0) return ok(detected);
      }
    }
  } catch {
    // Fall through.
  }
  return unavailable('Physical core count is not exposed by this platform');
}

export async function getGpuDevices(): Promise<Field<GpuDevice[]>> {
  try {
    let devices: GpuDevice[] = [];

    if (os.platform() === 'win32') {
      const rows = asArray((await getWindowsStaticFacts())?.gpu ?? null);
      devices = rows
        .filter((row) => firstText(row.Name))
        .map((row) => ({
          name: firstText(row.Name) as string,
          driverVersion:
            firstText(row.DriverVersion) ? ok(firstText(row.DriverVersion) as string) : unavailable('Driver version not reported'),
          memoryBytes:
            typeof row.AdapterRAM === 'number' && row.AdapterRAM > 0
              ? ok(row.AdapterRAM)
              : unavailable('Adapter memory not reported'),
        }));
    } else if (os.platform() === 'darwin') {
      const result = await runCommand('system_profiler', ['SPDisplaysDataType', '-json'], 12_000);
      if (result.exitCode === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
        const entries = asArray(parsed.SPDisplaysDataType as unknown[]) as Array<Record<string, unknown>>;
        devices = entries
          .map((entry) => firstText(entry.spdisplays_device_name ?? entry.spdisplays_chipset))
          .filter((name): name is string => Boolean(name))
          .map((name) => ({
            name,
            driverVersion: unavailable('Driver version not reported by macOS'),
            memoryBytes: unavailable('Adapter memory not reported by macOS'),
          }));
      }
    } else {
      const lspci = await runCommand('lspci', [], 5000);
      if (lspci.exitCode === 0) {
        devices = lspci.stdout
          .split(/\r?\n/)
          .filter((line) => /vga|3d controller|display controller/i.test(line))
          .map((line) => line.replace(/^[^ ]+ /, '').trim())
          .map((name) => ({
            name,
            driverVersion: unavailable('Driver version requires lspci -k'),
            memoryBytes: unavailable('Adapter memory not reported'),
          }));
      }
      if (devices.length === 0) {
        const nvidia = await runCommand('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], 5000);
        if (nvidia.exitCode === 0) {
          devices = nvidia.stdout.split(/\r?\n/).filter(Boolean).map((name) => ({
            name: name.trim(),
            driverVersion: unavailable('Driver version not read'),
            memoryBytes: unavailable('Adapter memory not read'),
          }));
        }
      }
    }

    return devices.length > 0 ? ok(devices) : unavailable('No GPU information exposed by this platform');
  } catch (error) {
    return unavailable(`GPU query failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export async function getGateways(): Promise<GatewayInfo> {
  const empty = {
    ipv4: unavailable<string>('Default IPv4 gateway not found'),
    ipv6: unavailable<string>('Default IPv6 gateway not found'),
    interfaceName: unavailable<string>('Active interface not detected'),
  };

  try {
    if (os.platform() === 'win32') {
      return (await getWindowsNetworkFacts())?.gateways ?? empty;
    }

    if (os.platform() === 'darwin') {
      const result = await runCommand('route', ['-n', 'get', 'default'], 5000);
      const gateway = /gateway:\s*(\S+)/.exec(result.stdout)?.[1];
      const interfaceName = /interface:\s*(\S+)/.exec(result.stdout)?.[1];
      const isIpv6 = gateway?.includes(':');
      return {
        ipv4: gateway && !isIpv6 ? ok(gateway) : empty.ipv4,
        ipv6: gateway && isIpv6 ? ok(gateway) : empty.ipv6,
        interfaceName: interfaceName ? ok(interfaceName) : empty.interfaceName,
      };
    }

    const routeFile = await readFileSafe('/proc/net/route');
    let v4Gateway: string | null = null;
    if (routeFile) {
      for (const line of routeFile.split(/\r?\n/).slice(1)) {
        const fields = line.trim().split(/\s+/);
        if (fields[1] === '00000000' && fields[2]) {
          v4Gateway = hexGatewayToIpv4(fields[2]);
          break;
        }
      }
    }
    const ipv6File = await readFileSafe('/proc/net/ipv6_route');
    let v6Gateway: string | null = null;
    if (ipv6File) {
      for (const line of ipv6File.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        if (fields[0] === '00000000000000000000000000000000' && fields[4] === '00' && fields[5] !== '00000000000000000000000000000000') {
          const hex = fields[5];
          const groups = hex.match(/.{4}/g);
          if (groups) v6Gateway = groups.join(':').replace(/(^|:)0+/g, '$1').replace(/:0+(?=:)/g, ':');
          break;
        }
      }
    }
    const wireless = await readFileSafe('/proc/net/wireless');
    let activeName: string | null = null;
    if (wireless) {
      const line = wireless.split(/\r?\n/)[2] ?? '';
      activeName = /^\s*(\S+):/.exec(line)?.[1] ?? null;
    }
    return {
      ipv4: v4Gateway ? ok(v4Gateway) : empty.ipv4,
      ipv6: v6Gateway ? ok(v6Gateway) : empty.ipv6,
      interfaceName: activeName ? ok(activeName) : empty.interfaceName,
    };
  } catch {
    return empty;
  }
}

export async function getDnsServers(): Promise<Field<string[]>> {
  try {
    if (os.platform() === 'win32') {
      return (await getWindowsNetworkFacts())?.dns ?? unavailable<string[]>('DNS configuration could not be read');
    }
    const resolv = await readFileSafe('/etc/resolv.conf');
    const servers = resolv
      ? resolv.split(/\r?\n/).map((line) => /^\s*nameserver\s+(\S+)/.exec(line)?.[1]).filter((value): value is string => Boolean(value))
      : [];
    return servers.length > 0 ? ok([...new Set(servers)]) : unavailable('No DNS servers reported');
  } catch {
    return unavailable('DNS configuration could not be read');
  }
}

export async function getConnectionType(activeName: string | null): Promise<Field<string>> {
  try {
    if (os.platform() === 'win32') {
      const rows = asArray((await getWindowsNetworkFacts())?.adapters ?? null).filter(
        (adapter) => adapter.Status === 'Up',
      );
      const row = rows.find((adapter) => adapter.Name === activeName) ?? rows[0];
      if (!row) return unavailable('No active network adapter found');
      const label = `${row.Name ?? ''} ${row.MediaType ?? ''}`;
      if (/wi-?fi|wireless|802\.11/i.test(label) || row.InterfaceType === 71) {
        return ok(row.LinkSpeed ? `Wi-Fi (${row.LinkSpeed})` : 'Wi-Fi');
      }
      if (/ethernet/i.test(label) || row.InterfaceType === 6) {
        return ok(row.LinkSpeed ? `Ethernet (${row.LinkSpeed})` : 'Ethernet');
      }
      return ok(row.MediaType || String(row.InterfaceType ?? 'Unknown'));
    }
    if (activeName) {
      const wireless = await readFileSafe('/proc/net/wireless');
      if (wireless?.includes(activeName)) return ok('Wi-Fi');
      const wirelessTool = await runCommand('iwconfig', [activeName], 4000);
      if (/IEEE 802\.11/.test(wirelessTool.stdout)) return ok('Wi-Fi');
      const ethtool = await runCommand('ethtool', [activeName], 4000);
      if (ethtool.exitCode === 0) return ok('Ethernet');
    }
    return unavailable('Connection media type could not be determined');
  } catch {
    return unavailable('Connection media type query failed');
  }
}

export async function getAdapterCounters(): Promise<Field<AdapterCounter[]>> {
  try {
    if (os.platform() === 'win32') {
      // `netstat -e` is a fast native counter source. PowerShell/WMI is kept
      // as a fallback because repeated WMI queries are expensive.
      const netstat = await runCommand('netstat', ['-e'], 4000);
      const bytesLine = netstat.stdout.split(/\r?\n/).find((line) => /^Bytes\s+/i.test(line.trim()));
      const bytes = bytesLine?.trim().split(/\s+/);
      if (bytes && bytes.length >= 3) {
        const rxBytes = Number(bytes[1].replace(/,/g, ''));
        const txBytes = Number(bytes[2].replace(/,/g, ''));
        if (Number.isFinite(rxBytes) && Number.isFinite(txBytes)) {
          return ok([{ name: 'All interfaces', rxBytes, txBytes }], 'os', 'Aggregated counter from netstat -e');
        }
      }

      const rows = asArray(await powerShellJson<CounterRow>('Get-NetAdapterStatistics | Select-Object Name,ReceivedBytes,SentBytes'));
      const counters = rows
        .filter((row) => row.Name && (typeof row.ReceivedBytes === 'number' || typeof row.SentBytes === 'number'))
        .map((row) => ({
          name: row.Name as string,
          rxBytes: typeof row.ReceivedBytes === 'number' ? row.ReceivedBytes : 0,
          txBytes: typeof row.SentBytes === 'number' ? row.SentBytes : 0,
        }));
      return counters.length > 0 ? ok(counters) : unavailable('No adapter counters available');
    }

    if (os.platform() === 'darwin') {
      const result = await runCommand('netstat', ['-ibn'], 5000);
      const counters: AdapterCounter[] = [];
      for (const line of result.stdout.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10 || fields[0] === 'Name') continue;
        const rx = Number(fields[6]);
        const tx = Number(fields[9]);
        if (Number.isFinite(rx) && Number.isFinite(tx)) counters.push({ name: fields[0], rxBytes: rx, txBytes: tx });
      }
      return counters.length > 0 ? ok(counters) : unavailable('No adapter counters available');
    }

    const dev = await readFileSafe('/proc/net/dev');
    if (!dev) return unavailable('/proc/net/dev is not readable');
    const counters: AdapterCounter[] = [];
    for (const line of dev.split(/\r?\n/).slice(2)) {
      const [namePart, valuesPart] = line.split(':');
      if (!valuesPart) continue;
      const values = valuesPart.trim().split(/\s+/).map(Number);
      if (values.length < 9) continue;
      counters.push({ name: namePart.trim(), rxBytes: values[0], txBytes: values[8] });
    }
    return counters.length > 0 ? ok(counters) : unavailable('No adapter counters available');
  } catch {
    return unavailable('Network counter query failed');
  }
}

export async function getMountPoints(): Promise<string[]> {
  if (os.platform() === 'win32') {
    const fs = await import('node:fs/promises');
    const mounts: string[] = [];
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const mount = `${letter}:\\`;
      try {
        await fs.statfs(mount);
        mounts.push(mount);
      } catch {
        // Drive letter not present.
      }
    }
    return mounts;
  }

  if (os.platform() === 'darwin') {
    const result = await runCommand('df', ['-kP'], 5000);
    return result.stdout.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/).at(-1)).filter((p): p is string => Boolean(p));
  }

  const mountsFile = await readFileSafe('/proc/mounts');
  if (!mountsFile) return ['/'];
  const mounts = new Set<string>(['/']);
  for (const line of mountsFile.split(/\r?\n/)) {
    const fields = line.split(/\s+/);
    if (fields.length >= 2 && (fields[0].startsWith('/dev/') || fields[1] === '/')) mounts.add(fields[1]);
  }
  return [...mounts];
}
