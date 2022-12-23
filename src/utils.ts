import { DataSetSessionInfo } from './types';

export const buildError = (errorMessage: string, error?: Error) => {
  const message = [errorMessage, error?.message].filter(Boolean).join('. ');

  return new Error(message);
};

export const camelToKebabCase = (str: string) => str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

export const convertSessionInfoToHeaders = (sessionInfo?: DataSetSessionInfo) => {
  if (!sessionInfo) {
    return {};
  }

  const entries = Object.entries(sessionInfo).map<[string, string]>(([key, value]) => {
    const newKey = camelToKebabCase(key);
    const newValue = (value instanceof Date ? value.getTime() : value).toString();

    if (!newKey.startsWith('server-')) {
      return [`server-${newKey}`, newValue];
    }

    return [newKey, newValue];
  });

  return Object.fromEntries(entries);
};

export const createUrl = (hostname: string, endpoint?: string): [undefined, string] | [Error, undefined] => {
  try {
    const { href } = new URL(endpoint || '', hostname);

    return [undefined, href];
  } catch (error) {
    return [error as Error, undefined];
  }
};
