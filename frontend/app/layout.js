import './globals.css';

export const metadata = {
  title: 'Estoque | Painel de controle',
  description: 'Gerencie produtos, movimentações e relatórios do seu estoque.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
