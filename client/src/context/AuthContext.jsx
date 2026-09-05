import React, { createContext, useState, useEffect } from 'react';
import { api, setToken } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [merchant, setMerchant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const storedToken = localStorage.getItem('riskyplay_token');
      if (storedToken) {
        try {
          const res = await api.auth.me();
          if (res?.data) {
            setMerchant(res.data);
          } else {
            setToken(null);
          }
        } catch (err) {
          console.warn('Session expired or invalid:', err);
          setToken(null);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  const login = async (email, password) => {
    const res = await api.auth.login(email, password);
    if (res?.data?.merchant) {
      setMerchant(res.data.merchant);
    }
    return res;
  };

  const register = async (name, email, password) => {
    const res = await api.auth.register(name, email, password);
    if (res?.data?.merchant) {
      setMerchant(res.data.merchant);
    }
    return res;
  };

  const logout = () => {
    setToken(null);
    setMerchant(null);
  };

  const fillDemo = () => ({
    email: 'demo@riskyplay.com',
    password: 'DemoPassword123!',
  });

  return (
    <AuthContext.Provider
      value={{
        merchant,
        isAuthenticated: Boolean(merchant),
        loading,
        login,
        register,
        logout,
        fillDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { useAuth } from './useAuth';
