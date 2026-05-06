export async function fetchPdfSource(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF source: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
