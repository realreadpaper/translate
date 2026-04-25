type PageCanvasProps = {
  label: string;
};

export function PageCanvas({ label }: PageCanvasProps) {
  return <section>{label}</section>;
}
