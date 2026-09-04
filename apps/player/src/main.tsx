import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
const MusicApp = lazy(() => import('./app/App').then((module) => ({ default: module.App })));
const ProbableMatches = lazy(() => import('./app/ProbableMatches').then((module) => ({ default: module.ProbableMatches })));
const Rhythm = lazy(() => import('./rhythm/RhythmApp').then((module) => ({ default: module.RhythmApp })));
const Root = location.pathname.startsWith('/probables') ? ProbableMatches : location.pathname.startsWith('/music') ? MusicApp : Rhythm;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<div className="app-loading">Cargando BlackMamba…</div>}><Root /></Suspense></React.StrictMode>);
