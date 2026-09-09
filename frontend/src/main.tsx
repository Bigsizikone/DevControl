import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionApp } from './session';
import './styles.css';
import './admin.css';
import './security.css';
import './forms.css';
import './orderful.css';
import './auth.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionApp />
  </StrictMode>,
);
