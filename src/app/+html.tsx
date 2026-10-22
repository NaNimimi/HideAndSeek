// Learn more https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';

// HTML-шаблон веб-версии (Telegram Mini App). Выполняется только в Node при сборке.
export default function Root({ children }: { children: React.ReactNode }) {
  const { bodyAttributes, bodyNodes, htmlAttributes, headNodes } = useServerDocumentContext();

  return (
    <html lang="ru" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#0B0E14" />
        {/* Telegram Mini App SDK: должен загрузиться до приложения */}
        <script src="https://telegram.org/js/telegram-web-app.js" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

const css = `
html, body { margin: 0; background: #0b0e14; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
* { scrollbar-width: none; }
::-webkit-scrollbar { display: none; }
`;
