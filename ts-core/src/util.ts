export const throttle = <R, A extends any[]>(
  fn: (...args: A) => R,
  delay: number,
): [(...args: A) => R | undefined, () => void] => {
  let wait = false;
  let timeout: NodeJS.Timeout;
  let cancelled = false;

  return [
    (...args: A) => {
      if (cancelled) return undefined;
      if (wait) return undefined;

      const val = fn(...args);

      wait = true;

      timeout = setTimeout(() => {
        wait = false;
      }, delay);

      return val;
    },
    () => {
      cancelled = true;
      clearTimeout(timeout);
    },
  ];
};

const retryableStatusCodes = [408, 500, 502, 503, 504, 525, 429];

export const isRetryableStatusCode = (statusCode: number) =>
  retryableStatusCodes.includes(statusCode);
