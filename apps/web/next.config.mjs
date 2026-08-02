/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Dùng chung package trong monorepo — Next phải transpile vì chúng là TS thô
  transpilePackages: ['@garageos/contracts', '@garageos/domain'],

  webpack(config) {
    // Các package dùng chung viết theo chuẩn ESM của Node (tsconfig NodeNext), nên
    // import nội bộ của chúng ghi đuôi `.js` dù file thật là `.ts`. Node/tsx hiểu
    // quy ước này, webpack thì không -> phải khai báo ánh xạ đuôi tường minh.
    // Bỏ dòng này thì apps/web sập ngay khi import bất kỳ package chung nào.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
