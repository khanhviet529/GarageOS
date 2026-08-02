import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * Cấu hình ESLint dùng chung.
 *
 * 🔒 Vì sao file này tồn tại và vì sao nó KHÔNG chỉ là style:
 *
 * `docs/05-invariants.md` mục INV-T-02 nói `tenantId` không bao giờ được đến từ
 * request, và ghi rõ cách enforce là **lint rule**. Nhưng suốt Phase 0 → 1.6,
 * `pnpm lint` ở mọi package là một lệnh `echo` — không có linter nào trong repo.
 * Bước `pnpm lint` trong CI luôn thoát 0. `CONTRIBUTING.md` hứa "không commit
 * code đỏ: lint + typecheck + test" nhưng thực tế đứng bằng hai chân.
 *
 * Nói cách khác: một bất biến mà tài liệu tuyên bố đã được bảo vệ, thực tế
 * không có gì bảo vệ. Đây là dạng nguy hiểm hơn cả không có bảo vệ — vì người
 * đọc tài liệu sẽ không đi kiểm lại.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/*.config.mjs',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 🔒 Quy tắc hook của React bắt được đúng lớp lỗi đã gây ra WEB-001 (đọc
    //    state cũ) — loại lỗi mà đọc code rất khó thấy.
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        globalThis: 'readonly',
      },
    },
    rules: {
      /*
       * 🔒 INV-T-02 — `tenantId` chỉ đến từ token đã xác thực.
       *
       * Đây là lý do chính khiến file này tồn tại. Quy tắc chặn đúng cái mà
       * tài liệu nói phải chặn: đọc tenantId (hoặc branchId) ra khỏi request.
       */
      'no-restricted-syntax': [
        'error',
        {
          // Phải neo vào `req`/`request`: bản đầu chỉ khớp `.body.tenantId` nên
          // nó bắt nhầm cả `response.body.tenantId` trong test — tức là báo lỗi
          // ở đúng chỗ đang KIỂM CHỨNG bất biến này.
          selector:
            "MemberExpression[object.object.name=/^(req|request|ctx)$/]" +
            "[object.property.name=/^(body|query|params|headers)$/]" +
            "[property.name=/^(tenantId|tenant_id|branchIds)$/]",
          message:
            'INV-T-02: tenantId phải lấy từ ActorContext (nguồn gốc là token đã ' +
            'xác thực), không bao giờ từ request. Xem CLAUDE.md.',
        },
        {
          // Bắt cả dạng phá cấu trúc: `const { tenantId } = req.body`
          selector:
            "VariableDeclarator[init.object.name=/^(req|request|ctx)$/]" +
            "[init.property.name=/^(body|query|params)$/] > ObjectPattern > " +
            "Property[key.name=/^(tenantId|tenant_id)$/]",
          message:
            'INV-T-02: tenantId phải lấy từ ActorContext, không phá cấu trúc từ request.',
        },
        {
          selector: "Literal[value=/^\\$\\{.*tenant.*\\}$/i]",
          message: 'Không nội suy tenantId vào SQL — dùng tham số truy vấn.',
        },
        {
          selector: "CallExpression[callee.property.name='queryRawUnsafe']",
          message: 'Cấm queryRawUnsafe với dữ liệu người dùng — xem CLAUDE.md.',
        },
      ],

      // Tiền và số: bắt lỗi so sánh lỏng, vốn hay che giấu lỗi kiểu
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      '@typescript-eslint/no-explicit-any': 'off', // test dùng nhiều, chấp nhận
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-undef': 'off', // TypeScript đã lo phần này
    },
  },
);
