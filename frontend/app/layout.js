import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Estoque | Gestão operacional',
  description: 'Painel para consulta e gestão de produtos, movimentações e relatórios de estoque.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="light" suppressHydrationWarning>
      <head>
        <Script id="estoque-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: `try { var savedTheme = localStorage.getItem('estoque-theme'); document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light'; } catch (error) { document.documentElement.dataset.theme = 'light'; }` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
