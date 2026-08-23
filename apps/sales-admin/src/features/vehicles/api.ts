import { api } from '@/lib/client';

export interface AdminProduct { id: string; slug: string; lifecycleStatus: string; name: string | null; status: string | null; version: number }
export const vehiclesApi = { list: () => api<{ items: AdminProduct[] }>('/api/v1/marketing/vehicle-products?limit=100') };
