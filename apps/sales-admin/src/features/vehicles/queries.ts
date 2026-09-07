'use client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { vehiclesApi } from './api';
export function useVehicles(enabled = true) { return useQuery({ queryKey: queryKeys.products(), queryFn: vehiclesApi.list, enabled }); }
