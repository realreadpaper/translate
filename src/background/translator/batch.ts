export function chunkSegments<T>(items: T[], size: number): T[][] {
  if (size <= 0) {
    throw new Error('batch size must be greater than 0');
  }

  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}
