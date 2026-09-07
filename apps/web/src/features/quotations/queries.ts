'use client';

import { quotationsApi } from '@/features/quotations/api';
import { repairOrdersApi } from '@/features/repair-orders/api';
import { useQuery } from '@tanstack/react-query';
import type { RepairOrderDetail } from '@garageos/contracts';
import { repairOrderKeys } from '@/features/repair-orders/queries';

export const quotationKeys = {
  list: repairOrderKeys.quotations,
  catalog: (vehicleId: string) => ['catalog', 'vehicle', vehicleId] as const,
};

export function useQuotations(orderId: string) {
  return useQuery({
    queryKey: quotationKeys.list(orderId),
    queryFn: () => quotationsApi.list(orderId),
    enabled: orderId !== '',
  });
}

export function useQuotationCatalog(order: RepairOrderDetail | undefined) {
  const vehicleId = order?.vehicle.id ?? '';
  return useQuery({
    queryKey: quotationKeys.catalog(vehicleId),
    queryFn: () => quotationsApi.catalogForVehicle(vehicleId),
    enabled: vehicleId !== '',
  });
}

export function useQuotationOrder(orderId: string) {
  return useQuery({
    queryKey: repairOrderKeys.detail(orderId),
    queryFn: () => repairOrdersApi.get(orderId),
    enabled: orderId !== '',
  });
}
