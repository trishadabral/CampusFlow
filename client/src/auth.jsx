// M1 — Platform Core: auth state for the whole app.
// Token + user profile persist in localStorage so refreshes keep you signed in.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth as authApi } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Restore session on load (cheap, offline-friendly).
    try {
      const raw = localStorage.getItem('campusflow_user');
      const token = localStorage.getItem('campusflow_token');
      if (raw && token) setUser(JSON.parse(raw));
    } catch {
      localStorage.removeItem('campusflow_user');
      localStorage.removeItem('campusflow_token');
    }
    setReady(true);
  }, []);

  const login = async (email, password) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('campusflow_token', data.token);
    localStorage.setItem('campusflow_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('campusflow_token');
    localStorage.removeItem('campusflow_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
