export const createUrl = (hostname: string, endpoint?: string): [undefined, string] | [Error, undefined] => {
  try {
    const { href } = new URL(endpoint || '', hostname);
    return [undefined, href];
  } catch (error) {
    return [error as Error, undefined];
  }
};
