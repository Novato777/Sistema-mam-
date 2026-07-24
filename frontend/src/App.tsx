import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hotel1 from './pages/Hotel1';
import Hotel2 from './pages/Hotel2';
import Restaurante from './pages/Restaurante';
import Lichigueria from './pages/Lichigueria';
import Configuracion from './pages/Configuracion';

// Guard de Autenticación
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública de Landing */}
          <Route path="/" element={<Landing />} />
          
          <Route path="/login" element={<Login />} />
          
          {/* Rutas Protegidas */}
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/hotel-1" 
            element={
              <ProtectedRoute>
                <Hotel1 />
              </ProtectedRoute>
            } 
          />
          
          <Route 
            path="/hotel-2" 
            element={
              <ProtectedRoute>
                <Hotel2 />
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
            path="/lichigueria" 
            element={
              <ProtectedRoute>
                <Lichigueria />
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
