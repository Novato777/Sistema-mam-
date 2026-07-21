import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hotel1 from './pages/Hotel1';
import Hotel2 from './pages/Hotel2';
import Restaurante from './pages/Restaurante';
import Lichigueria from './pages/Lichigueria';

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
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Rutas Protegidas */}
        <Route 
          path="/" 
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
              <div className="bg-white p-8 rounded-2xl border border-slate-100">
                <h2 className="text-2xl font-bold">Configuración</h2>
                <p className="text-slate-500 mt-2">Opciones de configuración del sistema.</p>
              </div>
            </ProtectedRoute>
          } 
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
