/**
 * App.jsx — main app router and layout.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import ProtectedRoute from './components/ProtectedRoute';

import Landing        from './pages/Landing';
import Auth           from './pages/Auth';
import Dashboard      from './pages/Dashboard';
import SignToText     from './pages/SignToText';
import TextToSign     from './pages/TextToSign';
import History        from './pages/History';
import AccountSettings from './pages/AccountSettings';

function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/"         element={<Landing />} />
            <Route path="/login"    element={<Auth defaultTab="login" />} />
            <Route path="/register" element={<Auth defaultTab="register" />} />

            {/* Protected */}
            <Route path="/dashboard"    element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/sign-to-text" element={<ProtectedRoute><SignToText /></ProtectedRoute>} />
            <Route path="/text-to-sign" element={<ProtectedRoute><TextToSign /></ProtectedRoute>} />
            <Route path="/history"      element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/account"      element={<ProtectedRoute><AccountSettings /></ProtectedRoute>} />

            {/* Legacy redirects */}
            <Route path="/profile"  element={<Navigate to="/account" replace />} />
            <Route path="/settings" element={<Navigate to="/account" replace />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SettingsProvider>
  );
}

export default App;
