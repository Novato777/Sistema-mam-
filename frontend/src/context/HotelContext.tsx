import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import API_URL from '../config/api';

export interface HotelStats {
  total_rooms: number;
  occupied_rooms: number;
  reserved_rooms?: number;
  free_rooms: number;
  cleaning_rooms: number;
  maintenance_rooms: number;
  occupancy_rate: number;
  active_guests?: number;
  open_registers?: number;
  income_today: number;
  expense_today: number;
  services_today?: number;
}

export interface HotelEntity {
  id: number;
  code: string;
  name: string;
  legal_name?: string;
  tax_id?: string;
  tax_regime?: string;
  logo_url?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  currency: string;
  timezone: string;
  check_in_time: string;
  check_out_time: string;
  accommodation_policy?: string;
  cancellation_policy?: string;
  reservation_policy?: string;
  sire_code?: string;
  tra_code?: string;
  user_role?: string;
  stats?: HotelStats;
}

export interface CurrentUser {
  id: number;
  username: string;
  full_name: string;
  document?: string;
  position?: string;
  email?: string;
  phone?: string;
  role: string;
  default_hotel_id: number;
  permissions: string[];
}

interface HotelContextType {
  hotels: HotelEntity[];
  activeHotel: HotelEntity | null;
  activeHotelId: number;
  setActiveHotelId: (id: number) => void;
  user: CurrentUser | null;
  hasPermission: (perm: string) => boolean;
  loadingHotels: boolean;
  refreshHotels: () => Promise<void>;
}

const HotelContext = createContext<HotelContextType | undefined>(undefined);

export function HotelProvider({ children }: { children: React.ReactNode }) {
  const [hotels, setHotels] = useState<HotelEntity[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [activeHotelId, setActiveHotelIdState] = useState<number>(() => {
    const saved = localStorage.getItem('activeHotelId');
    return saved ? parseInt(saved, 10) || 1 : 1;
  });
  const [loadingHotels, setLoadingHotels] = useState<boolean>(true);

  const setActiveHotelId = (id: number) => {
    setActiveHotelIdState(id);
    localStorage.setItem('activeHotelId', String(id));
  };

  const refreshHotels = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setHotels([]);
      setUser(null);
      setLoadingHotels(false);
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [meRes, hotelsRes] = await Promise.all([
        fetch(`${API_URL}/api/auth/me`, { headers }),
        fetch(`${API_URL}/api/hotels`, { headers })
      ]);

      if (meRes.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser({
          id: meData.id,
          username: meData.username,
          full_name: meData.full_name || meData.username,
          document: meData.document,
          position: meData.position,
          email: meData.email,
          phone: meData.phone,
          role: meData.role || 'PROPIETARIO',
          default_hotel_id: meData.default_hotel_id || 1,
          permissions: Array.isArray(meData.permissions) ? meData.permissions : []
        });
      }

      if (hotelsRes.ok) {
        const hotelsData: HotelEntity[] = await hotelsRes.json();
        setHotels(hotelsData);
        if (hotelsData.length > 0) {
          const exists = hotelsData.some((h) => h.id === activeHotelId);
          if (!exists) {
            setActiveHotelId(hotelsData[0].id);
          }
        }
      }
    } catch (error) {
      console.error('Error al cargar contexto multi-hotel:', error);
    } finally {
      setLoadingHotels(false);
    }
  }, [activeHotelId]);

  useEffect(() => {
    refreshHotels();
  }, [refreshHotels]);

  const activeHotel = hotels.find((h) => h.id === activeHotelId) || hotels[0] || null;

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (!user) return false;
      if (user.role === 'PROPIETARIO' || user.role === 'ADMIN' || user.role === 'ADMINISTRADOR') {
        return true;
      }
      return user.permissions.includes(perm);
    },
    [user]
  );

  return (
    <HotelContext.Provider
      value={{
        hotels,
        activeHotel,
        activeHotelId: activeHotel ? activeHotel.id : activeHotelId,
        setActiveHotelId,
        user,
        hasPermission,
        loadingHotels,
        refreshHotels
      }}
    >
      {children}
    </HotelContext.Provider>
  );
}

export function useHotel() {
  const context = useContext(HotelContext);
  if (!context) {
    throw new Error('useHotel debe ser usado dentro de un HotelProvider');
  }
  return context;
}
