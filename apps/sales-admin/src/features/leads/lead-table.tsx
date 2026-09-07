'use client';

import { LEAD_STATUS_LABEL, type LeadView } from '@garageos/contracts';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { khoangCach, gioKeTu } from '@/lib/format';
import { cn } from '@/lib/utils';
import { LEAD_INTENT_LABEL, LEAD_SOURCE_LABEL, LEAD_STATUS_TONE } from './labels';

const GIO_QUA_HAN = 48;

type Cot = 'fullName' | 'productName' | 'intent' | 'source' | 'assigneeName' | 'status' | 'updatedAt';
type Chieu = 'asc' | 'desc';

const COT: { key: Cot; nhan: string; xepDuoc: boolean }[] = [
  { key: 'fullName', nhan: 'Khách hàng', xepDuoc: true },
  { key: 'productName', nhan: 'Xe quan tâm', xepDuoc: true },
  { key: 'intent', nhan: 'Nhu cầu', xepDuoc: true },
  { key: 'source', nhan: 'Nguồn', xepDuoc: true },
  { key: 'assigneeName', nhan: 'Phụ trách', xepDuoc: true },
  { key: 'status', nhan: 'Trạng thái', xepDuoc: true },
  { key: 'updatedAt', nhan: 'Cập nhật', xepDuoc: true },
];

function giaTri(lead: LeadView, cot: Cot): string {
  switch (cot) {
    case 'fullName': return lead.fullName;
    case 'productName': return lead.productName ?? '';
    case 'intent': return LEAD_INTENT_LABEL[lead.intent];
    case 'source': return LEAD_SOURCE_LABEL[lead.source];
    case 'assigneeName': return lead.assigneeName ?? '';
    case 'status': return lead.status;
    case 'updatedAt': return lead.updatedAt;
  }
}

export function LeadTable({ leads }: { leads: LeadView[] }): React.ReactElement {
  const [xep, setXep] = useState<{ cot: Cot; chieu: Chieu }>({ cot: 'updatedAt', chieu: 'desc' });

  const daXep = useMemo(() => {
    const ban = [...leads];
    ban.sort((a, b) => {
      const x = giaTri(a, xep.cot);
      const y = giaTri(b, xep.cot);
      /* Ô rỗng luôn xuống cuối ở cả hai chiều: "Chưa gán" là thứ cần thấy khi
         chủ động tìm, không phải thứ chen lên đầu mỗi lần đổi chiều sắp xếp. */
      if (x === '' && y !== '') return 1;
      if (y === '' && x !== '') return -1;
      const d = xep.cot === 'updatedAt' ? Date.parse(x) - Date.parse(y) : x.localeCompare(y, 'vi');
      return xep.chieu === 'asc' ? d : -d;
    });
    return ban;
  }, [leads, xep]);

  const doiXep = (cot: Cot): void =>
    setXep((truoc) => ({ cot, chieu: truoc.cot === cot && truoc.chieu === 'desc' ? 'asc' : 'desc' }));

  return (
    <TableWrap className="rounded-lg border border-line bg-ink-1">
      <Table>
        <TableHeader>
          <TableRow className="bg-ink-2 hover:bg-ink-2">
            {COT.map((c, i) => {
              const dangXep = xep.cot === c.key;
              const Icon = !dangXep ? ChevronsUpDown : xep.chieu === 'asc' ? ArrowUp : ArrowDown;
              return (
                <TableHead
                  key={c.key}
                  pinned={i === 0}
                  className={cn(i === 0 && 'bg-ink-2')}
                  aria-sort={dangXep ? (xep.chieu === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => doiXep(c.key)}
                    className="inline-flex items-center gap-1.5 text-inherit transition-colors hover:text-text"
                  >
                    {c.nhan}
                    <Icon className={cn('h-3 w-3', dangXep ? 'text-brand' : 'text-text-muted')} />
                  </button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>

        <TableBody>
          {daXep.map((lead) => {
            const treHen = lead.status === 'NEW' && gioKeTu(lead.createdAt) > GIO_QUA_HAN;
            return (
              <TableRow key={lead.id}>
                <TableCell pinned className="bg-ink-1">
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-2.5 hover:underline">
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-ink-3 text-xs font-semibold text-text">
                      {lead.fullName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-text">{lead.fullName}</span>
                      <span className="numeric block truncate text-[11px] text-text-muted">{lead.phoneNormalized}</span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-text-muted">
                  {lead.productName ?? <span className="text-text-muted">—</span>}
                  {lead.variantName !== null && <span className="block text-[11px] text-text-muted">{lead.variantName}</span>}
                </TableCell>
                <TableCell className="text-text-muted">{LEAD_INTENT_LABEL[lead.intent]}</TableCell>
                <TableCell className="text-text-muted">{LEAD_SOURCE_LABEL[lead.source]}</TableCell>
                <TableCell className={lead.assigneeName === null ? 'text-warn' : 'text-text-muted'}>
                  {lead.assigneeName ?? 'Chưa gán'}
                </TableCell>
                <TableCell>
                  {treHen ? (
                    <Badge tone="warn">Quá {GIO_QUA_HAN} giờ</Badge>
                  ) : (
                    <Badge tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-[11px] text-text-muted">
                  {khoangCach(lead.updatedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
