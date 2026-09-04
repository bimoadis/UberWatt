import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ÜberWatt — run when power is free. Stop when it is not.',
  description: 'Real-time grid signals for flexible power loads. Watch ERCOT, CAISO, and global power markets with verifiable Solana proof on-chain.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#2E7D32',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('ÜberWatt ServiceWorker registered:', registration.scope);
                    },
                    function(err) {
                      console.log('ÜberWatt ServiceWorker registration failed:', err);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
