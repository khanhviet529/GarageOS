'use client';

import { ExternalLink, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NAV_PLACEMENT_LABEL, NavPlacement, type NavItemInput } from '@garageos/contracts';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { NavItem } from '@/features/dieu-huong/api';
import { useNavItems, useNavMutations, useRedirects } from '@/features/dieu-huong/queries';
import { errorMessage } from '@/lib/client';

/**
 * 🔒 Bốn trang landing đang CÓ THẬT. Máy chủ tự ẩn mục trỏ ra ngoài danh sách
 *    này (`TRANG_CO_THAT` trong `public-landing.controller.ts`) — ở đây chỉ là
 *    lời cảnh báo sớm, để người nhập biết trước thay vì nhập xong rồi thấy mục
 *    của mình không hiện.
 */
const TRANG_CO_THAT = ['/', '/xe', '/tin-tuc', '/lien-he'];

function trangCoThat(duong: string): boolean {
  const goc = duong.split('?')[0]?.split('#')[0] ?? duong;
  return TRANG_CO_THAT.includes(goc);
}

const COT_CHAN_TRANG = ['Cột 1 — Sản phẩm', 'Cột 2 — Hỗ trợ', 'Cột 3'];

export default function NavigationPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:navigationRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:navigationWrite');

  const nav = useNavItems(canRead);
  const red = useRedirects(canRead);
  const actions = useNavMutations();

  const [moMuc, setMoMuc] = useState(false);
  const [sua, setSua] = useState<NavItem | null>(null);
  const [placement, setPlacement] = useState<NavPlacement>('HEADER');
  const [columnIndex, setColumnIndex] = useState('0');
  const [label, setLabel] = useState('');
  const [duong, setDuong] = useState('');
  const [laNgoai, setLaNgoai] = useState(false);

  const [moChuyen, setMoChuyen] = useState(false);
  const [tu, setTu] = useState('');
  const [den, setDen] = useState('');
  const [ma, setMa] = useState('301');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chay = (op: Promise<unknown>): void => {
    void op.catch((cause: unknown) => setError(errorMessage(cause)));
  };

  function moHopThoai(item: NavItem | null, vt: NavPlacement): void {
    setSua(item);
    setPlacement(item?.placement ?? vt);
    setColumnIndex(String(item?.columnIndex ?? 0));
    setLabel(item?.label ?? '');
    setDuong(item?.path ?? item?.externalUrl ?? '');
    setLaNgoai(item !== null && item.path === null);
    setMoMuc(true);
  }

  async function luuMuc(): Promise<void> {
    setBusy(true);
    const input: NavItemInput = {
      placement,
      columnIndex: placement === 'HEADER' ? 0 : Number(columnIndex),
      label: label.trim(),
      path: laNgoai ? null : duong.trim(),
      externalUrl: laNgoai ? duong.trim() : null,
      displayOrder: sua?.displayOrder ?? 100,
      visible: sua?.visible ?? true,
    };
    try {
      if (sua === null) await actions.create.mutateAsync(input);
      else await actions.update.mutateAsync({ id: sua.id, input });
      setMoMuc(false);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function luuChuyen(): Promise<void> {
    setBusy(true);
    try {
      await actions.createRedirect.mutateAsync({
        fromPath: tu.trim(),
        toPath: den.trim(),
        statusCode: ma === '302' ? 302 : 301,
      });
      setMoChuyen(false);
      setTu('');
      setDen('');
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const muc = nav.data?.items ?? [];

  return (
    <PageShell title="Menu & chuyển hướng" subtitle="Điều hướng đầu trang, chân trang và bảng chuyển hướng URL">
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem điều hướng.</Alert>
      ) : nav.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="flex max-w-4xl flex-col gap-4">
          {NavPlacement.options.map((vt) => (
            <Card key={vt}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{NAV_PLACEMENT_LABEL[vt]}</CardTitle>
                {canWrite && (
                  <Button variant="secondary" size="sm" onClick={() => moHopThoai(null, vt)}>
                    <Plus className="h-[15px] w-[15px]" />
                    Thêm mục
                  </Button>
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {muc.filter((m) => m.placement === vt).length === 0 ? (
                  <p className="text-xs text-text-muted">
                    Chưa có mục nào — landing đang dùng menu mặc định.
                  </p>
                ) : (
                  muc
                    .filter((m) => m.placement === vt)
                    .map((m) => {
                      const dich = m.path ?? m.externalUrl ?? '';
                      const gay = m.path !== null && !trangCoThat(m.path);
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink-2 px-3 py-2"
                        >
                          <span className="text-[13px] text-text">{m.label}</span>
                          <span className="numeric text-[11px] text-text-muted">{dich}</span>
                          {m.externalUrl !== null && (
                            <Badge tone="neutral">
                              <ExternalLink className="h-3 w-3" />
                              Ngoài
                            </Badge>
                          )}
                          {vt === 'FOOTER' && <Badge tone="neutral">{COT_CHAN_TRANG[m.columnIndex]}</Badge>}
                          {!m.visible && <Badge tone="neutral">Đã ẩn</Badge>}
                          {/*
                            🔒 Máy chủ TỰ ẩn mục trỏ tới trang không có thật. Nói
                               ra ở đây để người nhập biết vì sao mục của họ không
                               hiện — im lặng ẩn đi là loại hỏng khó lần nhất.
                          */}
                          {gay && <Badge tone="warn">Trang chưa có — landing tự ẩn</Badge>}
                          <span className="flex-1" />
                          {canWrite && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  chay(
                                    actions.update.mutateAsync({
                                      id: m.id,
                                      input: {
                                        placement: m.placement,
                                        columnIndex: m.columnIndex,
                                        label: m.label,
                                        path: m.path,
                                        externalUrl: m.externalUrl,
                                        displayOrder: m.displayOrder,
                                        visible: !m.visible,
                                      },
                                    }),
                                  )
                                }
                              >
                                {m.visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                {m.visible ? 'Ẩn' : 'Hiện'}
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => moHopThoai(m, vt)}>
                                Sửa
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => chay(actions.remove.mutateAsync(m.id))}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Chuyển hướng URL</CardTitle>
              {canWrite && (
                <Button variant="secondary" size="sm" onClick={() => setMoChuyen(true)}>
                  <Plus className="h-[15px] w-[15px]" />
                  Thêm chuyển hướng
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              <p className="text-xs text-text-muted">
                Dùng khi đổi đường dẫn một trang: link cũ đã nằm ngoài internet vẫn phải tới đúng chỗ.
              </p>
              {(red.data?.items ?? []).length === 0 ? (
                <p className="text-xs text-text-muted">Chưa có chuyển hướng nào.</p>
              ) : (
                (red.data?.items ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink-2 px-3 py-2"
                  >
                    <span className="numeric text-[12px] text-text">{r.fromPath}</span>
                    <span className="text-text-muted">→</span>
                    <span className="numeric text-[12px] text-text">{r.toPath}</span>
                    <Badge tone="neutral">{r.statusCode}</Badge>
                    <span className="flex-1" />
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => chay(actions.removeRedirect.mutateAsync(r.id))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={moMuc} onOpenChange={setMoMuc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sua === null ? 'Thêm mục menu' : 'Sửa mục menu'}</DialogTitle>
            <DialogDescription>
              Mỗi mục cần đúng một đích: đường dẫn trong trang hoặc liên kết ra ngoài.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nhan">Nhãn</Label>
              <Input id="nhan" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
              <Label htmlFor="la-ngoai">Liên kết ra ngoài</Label>
              <Switch id="la-ngoai" checked={laNgoai} onCheckedChange={setLaNgoai} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dich">{laNgoai ? 'Địa chỉ đầy đủ' : 'Đường dẫn'}</Label>
              <Input
                id="dich"
                maxLength={500}
                value={duong}
                placeholder={laNgoai ? 'https://facebook.com/showroom' : '/xe'}
                onChange={(e) => setDuong(e.target.value)}
              />
              {!laNgoai && duong.trim() !== '' && !trangCoThat(duong.trim()) && (
                <p className="text-[11px] text-warn">
                  Landing chưa có trang này, nên mục sẽ tự ẩn. Trang đang có:{' '}
                  <span className="numeric">{TRANG_CO_THAT.join(' · ')}</span>
                </p>
              )}
            </div>

            {placement === 'FOOTER' && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cot">Cột</Label>
                <Select value={columnIndex} onValueChange={setColumnIndex}>
                  <SelectTrigger id="cot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COT_CHAN_TRANG.map((c, i) => (
                      <SelectItem key={c} value={String(i)}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoMuc(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button onClick={() => void luuMuc()} disabled={busy || label.trim() === '' || duong.trim() === ''}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moChuyen} onOpenChange={setMoChuyen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thêm chuyển hướng</DialogTitle>
            <DialogDescription>
              Khách mở đường dẫn cũ sẽ được đưa sang đường dẫn mới.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tu">Từ đường dẫn</Label>
              <Input id="tu" value={tu} placeholder="/tin-tuc-cu" onChange={(e) => setTu(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="den">Tới</Label>
              <Input id="den" value={den} placeholder="/tin-tuc" onChange={(e) => setDen(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ma">Loại</Label>
              <Select value={ma} onValueChange={setMa}>
                <SelectTrigger id="ma">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="301">301 — chuyển vĩnh viễn</SelectItem>
                  <SelectItem value="302">302 — chuyển tạm thời</SelectItem>
                </SelectContent>
              </Select>
              {/*
                301 nói với Google "địa chỉ này đổi hẳn" và nó chuyển thứ hạng
                sang trang mới; 302 thì không. Chọn nhầm 302 cho một lần đổi vĩnh
                viễn là mất thứ hạng đã có.
              */}
              <p className="text-[11px] text-text-muted">
                Đổi hẳn thì chọn 301 — công cụ tìm kiếm mới chuyển thứ hạng sang trang mới.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoChuyen(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button onClick={() => void luuChuyen()} disabled={busy || tu.trim() === '' || den.trim() === ''}>
              {busy ? 'Đang lưu…' : 'Thêm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
