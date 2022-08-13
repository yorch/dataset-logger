export const flattenNestedObject = (obj: any, prefix = ''): Record<string, unknown> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  Object.entries(obj).reduce((acc, [key, value]) => {
    if (typeof value === 'object' && value !== null) {
      return {
        ...acc,
        ...flattenNestedObject(value, `${prefix}${key}.`),
      };
    } else {
      return {
        ...acc,
        [`${prefix}${key}`]: value,
      };
    }
  }, {});
