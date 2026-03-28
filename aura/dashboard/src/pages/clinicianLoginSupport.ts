export function shouldShowDemoCredentials(hostname?: string): boolean {
  const normalizedHostname =
    typeof hostname === 'string' ? hostname.trim().toLowerCase() : '';

  return normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1';
}
