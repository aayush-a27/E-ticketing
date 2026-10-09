import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes/router.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { CityProvider } from './context/CityContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import './styles/index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <AuthProvider>
        {/* City depends on the session, so it sits inside auth. */}
        <CityProvider>
          <RouterProvider router={router} />
        </CityProvider>
      </AuthProvider>
    </ToastProvider>
  </StrictMode>,
);
