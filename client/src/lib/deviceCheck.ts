export type DesktopPlatform = 'windows' | 'linux' | 'unsupported';

interface UserAgentDataHint {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ platform?: string; mobile?: boolean }>;
}

/**
 * UX gate only — never a security control. A browser cannot be trusted to
 * report the real host OS, so access control stays token-based.
 */
export async function detectDesktopPlatform(): Promise<DesktopPlatform> {
  const uaData = (navigator as Navigator & { userAgentData?: UserAgentDataHint }).userAgentData;
  let platform = uaData?.platform ?? '';
  let mobile = uaData?.mobile ?? false;

  try {
    if (uaData?.getHighEntropyValues) {
      const hints = await uaData.getHighEntropyValues(['platform', 'mobile']);
      platform = hints.platform || platform;
      mobile = hints.mobile ?? mobile;
    }
  } catch {
    // Fall back to the low-entropy hints and UA below.
  }

  const ua = navigator.userAgent.toLowerCase();
  if (mobile || /android|iphone|ipad|ipod|mobile|tablet/i.test(ua)) return 'unsupported';
  if (/windows/i.test(platform) || /windows/i.test(ua)) return 'windows';
  if (/linux/i.test(platform) || /linux|x11/i.test(ua)) return 'linux';
  return 'unsupported';
}
