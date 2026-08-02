import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

/**
 * Kiểm tra ở các điểm ngắt mà skill ui-ux-pro-max liệt kê: 375 / 768 / 1024 / 1440.
 *
 * Quy tắc bị vi phạm nhiều nhất và dễ bỏ sót nhất: **trang không được trượt
 * ngang**. Nó không làm gãy tính năng nào nên test chức năng không bao giờ bắt
 * được — nhưng nhân viên dùng điện thoại khi máy tính ở quầy đang bận thì gặp
 * ngay, và đó là ấn tượng đầu tiên về chất lượng phần mềm.
 */
const DIEM_NGAT = [
  { ten: '375 (iPhone SE)', width: 375, height: 812 },
  { ten: '768 (máy tính bảng)', width: 768, height: 1024 },
  { ten: '1024 (laptop nhỏ)', width: 1024, height: 768 },
  { ten: '1440 (màn quầy)', width: 1440, height: 900 },
];

async function login(page: Page) {
  await page.goto('/dang-nhap');
  await page.getByLabel('Số điện thoại').fill('0901000003');
  await page.getByLabel('Mật khẩu').fill('demo1234');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByText('Lê Văn Cố Vấn · Cố vấn dịch vụ')).toBeVisible();
}

/** Chiều rộng nội dung không được vượt chiều rộng khung nhìn */
async function khongTruotNgang(page: Page, moTa: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    scroll,
    `${moTa}: nội dung rộng ${scroll}px trong khung ${client}px — trang trượt ngang`,
  ).toBeLessThanOrEqual(client + 1);
}

for (const bp of DIEM_NGAT) {
  test(`trang đăng nhập không trượt ngang ở ${bp.ten}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto('/dang-nhap');
    await khongTruotNgang(page, `đăng nhập @${bp.width}`);
  });

  test(`màn tiếp nhận không trượt ngang ở ${bp.ten}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await login(page);
    await khongTruotNgang(page, `tiếp nhận @${bp.width}`);
  });

  test(`danh sách xe không trượt ngang ở ${bp.ten}`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await login(page);
    await page.getByRole('link', { name: 'Xe trong xưởng' }).click();
    await expect(page.getByRole('heading', { name: /Xe trong xưởng/ })).toBeVisible();
    await khongTruotNgang(page, `xe trong xưởng @${bp.width}`);
    if (bp.width === 375) {
      await page.screenshot({ path: `${SHOTS}/30-xe-trong-xuong-375.png`, fullPage: true, caret: 'initial' });
    }
  });
}
