export function parseRequestUrl(input: string): URL {
  return new URL(input);
}

export function jsonHeaders(): Record<string, string> {
  return {
    'content-type': 'application/json',
  };
}

export function isPath(pathname: string, expected: string): boolean {
  return pathname === expected;
}

export function startsWithPath(pathname: string, expectedPrefix: string): boolean {
  return pathname.startsWith(expectedPrefix);
}
