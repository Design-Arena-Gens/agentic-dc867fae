import type { AppProps } from 'next/app';
import { useEffect } from 'react';
import { initSocket } from '../lib/socket';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    initSocket();
  }, []);

  return <Component {...pageProps} />;
}
