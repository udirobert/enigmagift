import React from 'react';
import ReactDOM from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App';
import './styles.css';

const MemoryRoom = lazy(() => import('./scenes/MemoryRoom'));
const WorldGift = lazy(() => import('./scenes/WorldGift'));
const ShelfGift = lazy(() => import('./scenes/ShelfGift'));
const MarbleStudio = lazy(() => import('./scenes/MarbleStudio'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<p>Opening the room…</p>}>
      {location.pathname === '/studio/room' ? (
        <MemoryRoom />
      ) : location.pathname === '/studio/world' ? (
        <ShelfGift />
      ) : location.pathname === '/studio/model' ? (
        <WorldGift />
      ) : location.pathname === '/studio/marble' ? (
        <MarbleStudio />
      ) : (
        <App />
      )}
    </Suspense>
  </React.StrictMode>,
);
