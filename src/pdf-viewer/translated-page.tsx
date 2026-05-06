type TranslatedPageProps = {
  text: string;
};

export function TranslatedPage({ text }: TranslatedPageProps) {
  return <article>{text}</article>;
}
