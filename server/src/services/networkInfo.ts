import os from 'node:os';
import type { Field, NetworkInfo, NetworkInterfaceInfo } from '../types';
import { ok, unavailable } from '../types';
import { createTtlCache } from '../lib/cache';
import { getConnectionType, getDnsServers, getGateways } from './platform';
import { lookupPublicIp } from './publicIp';

const networkFacts = createTtlCache(30_000);

function normalizeInterfaces(): NetworkInterfaceInfo[] {
  const result: NetworkInterfaceInfo[] = [];
  const entries = os.networkInterfaces();

  for (const [name, addresses] of Object.entries(entries)) {
    if (!addresses || addresses.length === 0) continue;
    result.push({
      name,
      mac: addresses.find((address) => address.mac && address.mac !== '00:00:00:00:00:00')?.mac ?? '',
      ipv4: addresses.filter((address) => address.family === 'IPv4').map((address) => address.address),
      ipv6: addresses.filter((address) => address.family === 'IPv6').map((address) => address.address),
      internal: addresses.every((address) => address.internal),
      cidr: addresses.find((address) => address.family === 'IPv4')?.cidr ?? '',
    });
  }

  return result;
}

function fieldFromString(value: string | undefined, reason: string): Field<string> {
  return value ? ok(value) : unavailable(reason);
}

function fieldFromStrings(values: string[], reason: string): Field<string[]> {
  return values.length > 0 ? ok(values) : unavailable(reason);
}

function inferActiveInterface(interfaces: NetworkInterfaceInfo[], gateway: string | null): string | null {
  if (!gateway || !gateway.includes('.')) return null;
  const prefix = gateway.split('.').slice(0, 3).join('.');
  return (
    interfaces.find((iface) => !iface.internal && iface.ipv4.some((ip) => ip.startsWith(`${prefix}.`)))?.name ?? null
  );
}

function inferConnectionType(name: string | undefined): Field<string> {
  if (!name) return unavailable('No active interface available to identify the connection type');
  if (/wi-?fi|wireless|802\.11/i.test(name)) return ok('Wi-Fi', 'derived', 'Inferred from the interface name');
  if (/ethernet|lan/i.test(name)) return ok('Ethernet', 'derived', 'Inferred from the interface name');
  return unavailable('Connection media type could not be determined');
}

export async function getNetworkInfo(): Promise<NetworkInfo> {
  const interfaces = normalizeInterfaces();
  const [gateways, dns, lookup] = await Promise.all([
    networkFacts('gateways', getGateways),
    networkFacts('dns', getDnsServers),
    lookupPublicIp(),
  ]);

  const activeName =
    gateways.interfaceName.value ??
    inferActiveInterface(interfaces, gateways.ipv4.value) ??
    interfaces.find((iface) => !iface.internal && iface.ipv4.length > 0 && !/169\.254\./.test(iface.ipv4[0]))?.name ??
    null;

  const active = interfaces.find((iface) => iface.name === activeName) ?? null;

  const probedConnection = await networkFacts(
    `connection:${active?.name ?? 'none'}`,
    () => getConnectionType(active?.name ?? null),
  );
  const connectionType = probedConnection.status === 'ok' ? probedConnection : inferConnectionType(active?.name);

  return {
    interfaces,
    activeInterface: active?.name ? ok(active.name) : unavailable('No active network interface identified'),
    connectionType,
    macAddress: fieldFromString(active?.mac, 'MAC address not exposed for the active interface'),
    localIpv4: fieldFromString(active?.ipv4[0], 'No IPv4 address on the active interface'),
    localIpv6: fieldFromStrings(active?.ipv6 ?? [], 'No IPv6 address on the active interface'),
    gateway: gateways.ipv4,
    gatewayIpv6: gateways.ipv6,
    dnsServers: dns,
    publicIp: lookup.publicIp,
    internet: lookup.internet,
    collectedAt: new Date().toISOString(),
  };
}
