import './globals.css';

export const metadata = {
  title: 'Estoque | Gestão operacional',
  description: 'Painel para consulta e gestão de produtos, movimentações e relatórios de estoque.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
