import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { HotelProvider } from './context/HotelContext';
import Layout from './components/Layout';
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

// Guard de Autenticación con Contexto Multi-Tenant
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return (
    <HotelProvider>
      <Layout>{children}</Layout>
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
          <Route path="/master" element={<MasterSaaS />} />

          {/* Rutas Protegidas del PMS */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hotels/:hotelId"
            element={
              <ProtectedRoute>
                <Hotel />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hotel-1"
            element={
              <ProtectedRoute>
                <Hotel />
              </ProtectedRoute>
            }
          />

          <Route
            path="/hotel-2"
            element={
              <ProtectedRoute>
                <Hotel />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reservas"
            element={
              <ProtectedRoute>
                <Reservas />
              </ProtectedRoute>
            }
          />

          <Route
            path="/recepcion"
            element={
              <ProtectedRoute>
                <Recepcion />
              </ProtectedRoute>
            }
          />

          <Route
            path="/caja"
            element={
              <ProtectedRoute>
                <Caja />
              </ProtectedRoute>
            }
          />

          <Route
            path="/limpieza"
            element={
              <ProtectedRoute>
                <Limpieza />
              </ProtectedRoute>
            }
          />

          <Route
            path="/restaurante"
            element={
              <ProtectedRoute>
                <Restaurante />
              </ProtectedRoute>
            }
          />

          <Route
            path="/inventario"
            element={
              <ProtectedRoute>
                <Inventario />
              </ProtectedRoute>
            }
          />

          <Route
            path="/contabilidad"
            element={
              <ProtectedRoute>
                <Contabilidad />
              </ProtectedRoute>
            }
          />

          <Route
            path="/mantenimiento"
            element={
              <ProtectedRoute>
                <Mantenimiento />
              </ProtectedRoute>
            }
          />

          <Route
            path="/personal"
            element={
              <ProtectedRoute>
                <Personal />
              </ProtectedRoute>
            }
          />

          <Route
            path="/reportes"
            element={
              <ProtectedRoute>
                <Reportes />
              </ProtectedRoute>
            }
          />

          <Route
            path="/usuarios"
            element={
              <ProtectedRoute>
                <Usuarios />
              </ProtectedRoute>
            }
          />

          <Route
            path="/notificaciones"
            element={
              <ProtectedRoute>
                <Notificaciones />
              </ProtectedRoute>
            }
          />

          <Route
            path="/configuracion"
            element={
              <ProtectedRoute>
                <Configuracion />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
