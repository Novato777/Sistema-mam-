import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { HotelProvider } from './context/HotelContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hotel from './pages/Hotel';
import Reservas from './pages/Reservas';
import Recepcion from './pages/Recepcion';
import Caja from './pages/Caja';
import Limpieza from './pages/Limpieza';
import Restaurante from './pages/Restaurante';
import Inventario from './pages/Inventario';
import Contabilidad from './pages/Contabilidad';
import Mantenimiento from './pages/Mantenimiento';
import Personal from './pages/Personal';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Notificaciones from './pages/Notificaciones';
import Configuracion from './pages/Configuracion';
import MasterSaaS from './pages/MasterSaaS';

// Guard de Autenticación con Contexto Multi-Tenant.
// Es una ruta de layout: HotelProvider y Layout se montan UNA sola vez y solo
// cambia la página interna (<Outlet />). Así, al navegar entre módulos no se
// vuelve a pedir /api/auth/me ni /api/hotels, ni parpadea el menú.
function ProtectedLayout() {
  const location = useLocation();
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return (
    <HotelProvider>
      <Layout>
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Layout>
    </HotelProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública de Landing */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/master" element={<ErrorBoundary><MasterSaaS /></ErrorBoundary>} />

          {/* Rutas Protegidas del PMS (comparten un solo Layout) */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/hotels/:hotelId" element={<Hotel />} />
            <Route path="/hotel-1" element={<Hotel />} />
            <Route path="/hotel-2" element={<Hotel />} />
            <Route path="/reservas" element={<Reservas />} />
            <Route path="/recepcion" element={<Recepcion />} />
            <Route path="/caja" element={<Caja />} />
            <Route path="/limpieza" element={<Limpieza />} />
            <Route path="/restaurante" element={<Restaurante />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/contabilidad" element={<Contabilidad />} />
            <Route path="/mantenimiento" element={<Mantenimiento />} />
            <Route path="/personal" element={<Personal />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="/notificaciones" element={<Notificaciones />} />
            <Route path="/configuracion" element={<Configuracion />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
