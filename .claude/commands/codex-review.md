---
description: Tự review diff, gọi Codex review độc lập, phản biện có căn cứ, chốt phương án
argument-hint: "[base] — mặc định: so với origin/main hoặc working tree"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

# /codex-review — Vòng review hai chiều Claude ↔ Codex

Chạy đủ **6 pha**: tự review → Codex review → phân loại → phản biện → kiểm chứng
bằng code chạy được → chốt và sửa.

## ⚠️ Nguyên tắc chống nhượng bộ — đọc trước khi bắt đầu

Codex có xu hướng **rút lại ý kiến ngay khi bị phản biện**, kể cả khi nó đúng.
Điều đó khiến "Codex đồng ý" trở thành tín hiệu **vô giá trị**. Quy trình này
được thiết kế quanh ba luật:

| # | Luật | Vì sao |
|---|---|---|
| **L1** | 🔒 **Sự đồng ý không phải bằng chứng.** Codex nói "bạn đúng" mà không nêu **lý do cụ thể vì sao lập luận của tôi bác bỏ nó** → ghi `UNRESOLVED`, **không** ghi `REFUTED` | Chống nhượng bộ giả |
| **L2** | 🔒 **Tôi cũng không được nhượng bộ.** Nếu tôi rút lại, phải nêu rõ bằng chứng nào của Codex bác bỏ tôi | Đối xứng — nếu chỉ ép một bên thì thiên lệch |
| **L3** | 🔒 **Trọng tài cuối cùng là code chạy được, không phải ý kiến.** Tranh chấp nào test được thì **viết test rồi chạy** | Hai LLM đồng ý nhau là bằng chứng yếu |

**Hệ quả quan trọng:** nếu sau 2 vòng mà cả hai bên đều chỉ có ý kiến, không bên
nào có bằng chứng hoặc test → **báo lại cho người dùng quyết**, tuyệt đối không
tự chọn bên rồi coi như đã chốt.

---

## Pha 0 — Tiền kiểm

```bash
# 🔒 Dò binary Codex MỚI NHẤT — không dùng `codex` trong PATH trực tiếp.
# Lý do: xem mục "Bẫy môi trường" ở cuối tài liệu.
CODEX=$(bash .claude/codex-review/resolve-codex.sh) || exit 1

git rev-parse --is-inside-work-tree >/dev/null || { echo "❌ Không phải git repo"; exit 1; }

# 🔒 Xoá kết quả lần trước. Nếu Codex lỗi giữa chừng mà file cũ còn nằm đó,
#    ta sẽ đọc lại phát hiện của lần review TRƯỚC và tưởng là đã review lần này.
rm -f .claude/codex-review/round*.json
```

**Cờ bắt buộc cho MỌI lệnh gọi Codex trong quy trình này:**

```bash
CODEX_FLAGS=(
  --sandbox read-only     # Codex chỉ đọc, không được sửa file của tôi
  -c 'mcp_servers={}'     # tắt MCP server — chúng treo khi chạy headless
)
# Lọc nhiễu: plugin Figma/Slack log lỗi OAuth nhưng không ảnh hưởng kết quả
NOISE='rmcp::transport|figma|AuthRequired|models_manager::cache'
```

Xác định phạm vi diff, theo thứ tự ưu tiên:

1. Nếu `$ARGUMENTS` có giá trị → `git diff $ARGUMENTS`
2. Nếu có `origin/main` và có commit chưa push → `git diff origin/main...HEAD`
3. Nếu working tree bẩn → `git diff HEAD`
4. Nếu không → `git show HEAD` (review commit gần nhất)

Ghi ra `.claude/codex-review/current.diff`.

🔒 Diff rỗng → dừng, báo "không có gì để review". Không gọi Codex.

---

## Pha 1 — Tự review trước (bắt buộc)

**Không gọi Codex khi chưa tự dọn.** Codex nên tốn công vào lỗi thật, không phải
vào lỗi tôi tự thấy được.

Theo thứ tự:

1. **Chạy kiểm tra máy móc** — cái nào có trong `package.json` thì chạy:
   `pnpm lint`, `pnpm typecheck`, `pnpm test`
   🔒 Có lỗi → sửa hết rồi mới đi tiếp. Không đưa code đỏ cho Codex review.
2. **Đọc lại diff của chính mình**, đối chiếu với:
   - `docs/05-invariants.md` — thay đổi này có phá bất biến nào không?
   - `docs/01-glossary.md` — tên có đúng quy ước không?
   - `CLAUDE.md` — có vi phạm nguyên tắc dự án không?
3. **Tự sửa** những gì thấy rõ, commit hoặc để nguyên trong working tree.
4. Ghi lại danh sách **những chỗ tôi cố ý làm vậy** (để phản biện Codex sau này
   không phải nghĩ lại) vào `.claude/codex-review/self-notes.md`.

---

## Pha 2 — Codex review độc lập

### 2a. Dựng bản tóm tắt phạm vi (bắt buộc, chạy trước khi gọi Codex)

🔒 **Không gọi Codex mà không đưa spec.** Reviewer không biết ranh giới dự án sẽ
đòi những thứ ta **cố ý không làm** → phình phạm vi, tốn công tranh luận vô ích.

```bash
{
  echo "# BỐI CẢNH DỰ ÁN — ĐỌC TRƯỚC KHI REVIEW"
  echo
  echo "## Giai đoạn hiện tại"
  echo "Phase: $(grep -m1 '^## Phase' docs/15-roadmap.md || echo 'xem docs/15-roadmap.md')"
  echo "Chỉ review theo tiêu chuẩn của giai đoạn này. KHÔNG đòi tính năng của giai đoạn sau."
  echo
  echo "## Phạm vi và hàng rào (docs/00-vision.md)"
  sed -n '/^### Không làm/,/^## /p' docs/00-vision.md
  echo
  echo "## Những gì CỐ Ý không làm (docs/12-architecture.md)"
  sed -n '/^## 12. Những gì cố ý KHÔNG làm/,/^💡/p' docs/12-architecture.md
  echo
  echo "## Quyết định kiến trúc đã chốt (không tranh luận lại nếu không có bằng chứng mới)"
  grep -h '^| \[00' docs/adr/README.md
  echo
  echo "## Nguyên tắc thiết kế xuyên suốt"
  sed -n '/^## Nguyên tắc thiết kế xuyên suốt/,/^## /p' docs/README.md
} > .claude/codex-review/scope-brief.md
```

### 2b. Bốn ranh giới phải nói rõ với Codex

| Ranh giới | Ý nghĩa với reviewer |
|---|---|
| **Hàng rào scope** (`00-vision.md`) | 7 thứ dự án dứt khoát không làm: kế toán đầy đủ, tính lương, mua hàng/PO, đồng sơn, cứu hộ, đa ngôn ngữ/đa tiền tệ, tích hợp HĐĐT thật. Đề xuất thêm chúng = **ngoài phạm vi**, không phải phát hiện |
| **Cố ý không làm** (`12-architecture.md` mục 12) | Microservices, event sourcing toàn hệ thống, CQRS đầy đủ, GraphQL, Kubernetes. Đã cân nhắc và loại có lý do |
| **ADR đã chốt** (`docs/adr/`) | 7 quyết định có lý do và hệ quả ghi sẵn. Muốn lật lại phải **phản bác đúng lý do trong ADR**, không được nêu sở thích |
| **Dấu ⚠️ trong docs** | Là **giả định đã biết chưa xác minh**, không phải lỗi. Báo lại là nhiễu |

### 2c. Ghi schema đầu ra

```bash
mkdir -p .claude/codex-review
cat > .claude/codex-review/finding-schema.json <<'JSON'
{
  "type": "object",
  "additionalProperties": false,
  "required": ["findings"],
  "properties": {
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id","severity","file","line","claim","failure_scenario","evidence","confidence","violated_invariant","suggested_fix"],
        "properties": {
          "id":       { "type": "string" },
          "severity": { "type": "string", "enum": ["BLOCKER","MAJOR","MINOR"] },
          "file":     { "type": "string" },
          "line":     { "type": "integer" },
          "claim":    { "type": "string" },
          "failure_scenario": { "type": "string" },
          "evidence": { "type": "string" },
          "confidence": { "type": "string", "enum": ["HIGH","MEDIUM","LOW"] },
          "violated_invariant": { "type": ["string","null"] },
          "suggested_fix": { "type": "string" }
        }
      }
    }
  }
}
JSON
```

Gọi Codex ở chế độ **chỉ đọc** (không cho nó sửa file):

```bash
"$CODEX" exec "${CODEX_FLAGS[@]}" \
  --output-schema .claude/codex-review/finding-schema.json \
  --output-last-message .claude/codex-review/round1.json \
  - <<'PROMPT' 2>&1 | grep -viE "$NOISE"
Bạn là reviewer độc lập cho dự án GarageOS (NestJS + Next.js + Expo + PostgreSQL).

Đọc `.claude/codex-review/current.diff` và review.

=== BẮT BUỘC ĐỌC TRƯỚC KHI REVIEW ===
1. `.claude/codex-review/scope-brief.md`  ← PHẠM VI DỰ ÁN. Đọc ĐẦU TIÊN.
2. CLAUDE.md                              — nguyên tắc dự án
3. docs/05-invariants.md                  — 41 bất biến phải luôn đúng
4. docs/01-glossary.md                    — quy ước đặt tên

=== RANH GIỚI PHẠM VI — VI PHẠM SẼ BỊ LOẠI ===

KHÔNG báo cáo, dù bạn thấy hợp lý, những thứ sau:

a) Tính năng nằm trong "hàng rào scope" của docs/00-vision.md
   (kế toán đầy đủ, tính lương, mua hàng/PO, đồng sơn, cứu hộ,
    đa ngôn ngữ, đa tiền tệ, tích hợp hoá đơn điện tử thật)

b) Kiến trúc đã CỐ Ý loại bỏ ở docs/12-architecture.md mục 12
   (microservices, event sourcing toàn hệ thống, CQRS đầy đủ,
    GraphQL, Kubernetes)

c) Lật lại quyết định trong docs/adr/ — TRỪ KHI bạn phản bác đúng
   lý do đã ghi trong chính ADR đó bằng bằng chứng mới. Nêu sở thích
   cá nhân ("nên dùng tRPC hơn") KHÔNG được chấp nhận.

d) Những chỗ đánh dấu ⚠️ trong docs — đó là giả định ĐÃ BIẾT là chưa
   xác minh, không phải lỗi bạn phát hiện ra.

e) Tính năng thuộc giai đoạn sau (docs/15-roadmap.md ghi "Giai đoạn 2"
   hoặc phase cao hơn phase hiện tại).

Nếu bạn thấy một vấn đề thật nhưng nó rơi vào (a)–(e), hãy BỎ QUA.
Diff này chỉ nên được đánh giá theo tiêu chuẩn của phạm vi và giai
đoạn hiện tại.

=== ƯU TIÊN TÌM, theo thứ tự ===
1. Phá bất biến trong docs/05-invariants.md (nghiêm trọng nhất)
2. Lỗi đúng đắn: race condition, thiếu transaction, thiếu khoá, N+1
3. Lỗ hổng bảo mật: thiếu kiểm tra tenant, SQL nối chuỗi, rò rỉ dữ liệu qua lỗi
4. Sai kiểu tiền (phải là số nguyên đồng), sai làm tròn
5. Thiếu test cho bất biến mới thêm

QUY TẮC BÁO CÁO — bắt buộc:
- Mỗi phát hiện PHẢI có `failure_scenario`: đầu vào cụ thể → kết quả sai cụ thể.
  Không mô tả được kịch bản hỏng thì ĐỪNG báo.
- `evidence` phải trích dẫn dòng code thật hoặc quy tắc cụ thể trong docs.
- KHÔNG báo: sở thích style, đặt tên chủ quan, "có thể cân nhắc", refactor thẩm mỹ.
- `confidence: LOW` chỉ dùng khi bạn thật sự không chắc — đừng dùng để né trách nhiệm.
- Không có lỗi thật thì trả về mảng rỗng. Trả về mảng rỗng là kết quả HỢP LỆ và tốt.
PROMPT
```

⚠️ Nếu `codex exec` lỗi hoặc timeout → báo người dùng, **không** tự bỏ qua pha này
rồi coi như đã review.

---

## Pha 3 — Phân loại (tôi làm)

Với **từng** finding, tôi tự phán định — trước khi tranh luận:

| Nhãn | Điều kiện | Hành động |
|---|---|---|
| `ACCEPT` | Tôi đồng ý và **tự kiểm chứng được** kịch bản hỏng | Sửa ngay ở Pha 6 |
| `DISPUTE` | Tôi cho là sai, **và có bằng chứng cụ thể** | Vào Pha 4 |
| `NEEDS-PROOF` | Không rõ đúng sai — test được | Vào Pha 5 |
| `OUT-OF-SCOPE` | Đúng về kỹ thuật nhưng nằm ngoài hàng rào scope, ADR đã chốt, hoặc thuộc giai đoạn sau | Ghi backlog, **không sửa**, không tranh luận |

🔒 **Không được gán `DISPUTE` chỉ vì "tôi nghĩ khác".** Không có bằng chứng thì
gán `NEEDS-PROOF` và để code phân xử.

---

## Pha 4 — Phản biện (chỉ với `DISPUTE`)

Tối đa **2 vòng**. Mỗi vòng gửi lại Codex:

```bash
"$CODEX" exec "${CODEX_FLAGS[@]}" \
  --output-schema .claude/codex-review/rebuttal-schema.json \
  --output-last-message .claude/codex-review/round2.json \
  - <<'PROMPT' 2>&1 | grep -viE "$NOISE"
Đây là phản biện cho finding <ID> bạn đã báo.

PHẢN BIỆN CỦA TÔI:
<lập luận + trích dẫn code file:line + kết quả lệnh đã chạy nếu có>

BẠN PHẢI CHỌN ĐÚNG MỘT TRONG BA, KHÔNG ĐƯỢC TRẢ LỜI CHUNG CHUNG:

  A. MAINTAIN — giữ nguyên. Bắt buộc đưa BẰNG CHỨNG MỚI mà phản biện của tôi
     chưa xử lý: trích dòng code khác, hoặc kịch bản đầu vào cụ thể mà lập luận
     của tôi không bao phủ.

  B. WITHDRAW — rút lại. Bắt buộc nêu RÕ luận điểm nào của tôi bác bỏ bạn và
     TẠI SAO. Câu trả lời kiểu "bạn nói đúng", "tôi đồng ý", "cảm ơn đã làm rõ"
     mà không nêu lý do cụ thể sẽ bị GHI NHẬN LÀ KHÔNG HỢP LỆ.

  C. REFRAME — vấn đề thật khác với cách bạn mô tả ban đầu. Nêu lại chính xác.

⚠️ CẢNH BÁO: đừng đồng ý chỉ vì tôi phản biện. Nếu bạn vẫn cho là mình đúng,
GIỮ NGUYÊN và tranh luận. Việc bạn nhượng bộ khi không có lý do làm hỏng toàn
bộ giá trị của vòng review này. Tôi có thể sai — hãy chứng minh điều đó.
PROMPT
```

### Đọc kết quả — điểm mấu chốt

| Codex trả về | Ghi nhận |
|---|---|
| `MAINTAIN` + bằng chứng mới | Xem lại. Nếu bằng chứng đứng vững → `CONFIRMED` |
| `WITHDRAW` + **nêu rõ lý do** | `REFUTED` — kết thúc |
| `WITHDRAW` **không nêu lý do** / chỉ "bạn đúng" | 🔒 **`UNRESOLVED`** — L1. Chuyển sang Pha 5 |
| `REFRAME` | Coi như finding mới, quay lại Pha 3 |

🔒 **L2 — tôi cũng phải tuân thủ:** nếu tôi thấy Codex đúng, tôi ghi rõ *bằng
chứng nào của nó bác bỏ tôi*. Không viết "Codex nói đúng" rồi sửa theo.

---

## Pha 5 — Kiểm chứng bằng code chạy được (trọng tài thật)

Áp dụng cho: `NEEDS-PROOF` và mọi `UNRESOLVED` từ Pha 4.

🔒 **Đây là pha quan trọng nhất.** Hai LLM đồng thuận không chứng minh được gì.
Một test đỏ thì có.

Với mỗi tranh chấp **test được**:

1. Viết một test **sẽ đỏ nếu finding là thật**
2. Chạy nó
3. Kết quả là phán quyết:

| Kết quả | Kết luận |
|---|---|
| Test đỏ | ✅ `CONFIRMED` — Codex đúng. Sửa, và **giữ lại test** |
| Test xanh | ✅ `REFUTED` — Codex sai. **Giữ lại test** làm hồi quy |
| Không test được | ⬜ `UNRESOLVED` → Pha 6 báo người dùng |

💡 Dù kết quả nào, test viết ra **đều được giữ lại**. Vòng review sinh ra tài sản
lâu dài, không chỉ sinh ra tranh luận.

Ví dụ áp dụng cho dự án này — tranh chấp về race condition thì test là:

```ts
const results = await Promise.allSettled(
  Array.from({ length: 50 }, () => service.reserve(actor, input)),
);
expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
await assertLedgerMatchesBalance();
```

---

## Pha 6 — Chốt và báo cáo

1. Sửa mọi `CONFIRMED` (`ACCEPT` + test đỏ)
2. Chạy lại toàn bộ `lint` / `typecheck` / `test`
3. Ghi `.claude/codex-review/verdict.md`
4. Báo cáo cho người dùng theo mẫu:

```markdown
## Kết quả /codex-review

**Phạm vi:** <mô tả diff> · **Codex tìm được:** N phát hiện

| # | Mức | Vị trí | Kết luận | Cách phân xử |
|---|---|---|---|---|
| 1 | BLOCKER | file:12 | ✅ CONFIRMED | Test đỏ → đã sửa |
| 2 | MAJOR | file:45 | ❌ REFUTED | Codex rút, nêu lý do: … |
| 3 | MINOR | file:78 | ⬜ UNRESOLVED | Cả hai chỉ có ý kiến |

### ⬜ Cần bạn quyết định
<Với mỗi UNRESOLVED: nêu lập luận CỦA CẢ HAI BÊN một cách công bằng,
 không nghiêng về phía tôi, rồi hỏi người dùng chọn.>

### Test mới thêm
<danh sách — kể cả test xanh chứng minh Codex sai>
```

🔒 **Không được tự chốt `UNRESOLVED`.** Đưa cả hai lập luận cho người dùng, trình
bày công bằng, để họ quyết.

---

## Chống lạm dụng

| Cạm bẫy | Ràng buộc |
|---|---|
| Gọi Codex khi code còn đỏ | Pha 1 bắt buộc trước |
| Coi "Codex im lặng" là đã duyệt | Codex lỗi → báo, không bỏ qua |
| Sửa theo Codex mà không hiểu | Mọi `ACCEPT` phải tự kiểm chứng được kịch bản hỏng |
| Cãi lấy được để bảo vệ code mình | L2 — tôi rút thì cũng phải nêu lý do |
| Tự chốt khi không ai có bằng chứng | `UNRESOLVED` luôn về tay người dùng |
| Review xong không còn dấu vết | `verdict.md` + test được giữ lại |
| **Codex đòi thêm tính năng ngoài scope** | Pha 2a bắt buộc gửi `scope-brief.md`; gán `OUT-OF-SCOPE`, không tranh luận |
| **Codex lật lại ADR bằng sở thích** | Chỉ chấp nhận nếu phản bác đúng lý do trong ADR bằng bằng chứng mới |
| Diff phình to vì "tiện tay sửa luôn" | `OUT-OF-SCOPE` áp dụng cho cả đề xuất của Codex lẫn của tôi |

---

## Bẫy môi trường — đã gặp và đã xử lý

Ghi lại để không phải chẩn đoán lại. Tất cả đều đã kiểm chứng trên máy này
(2026-08-01):

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `The 'gpt-5.6-terra' model requires a newer version of Codex` | 🔒 **Máy có 2 bản Codex.** `codex` trong PATH là bản npm **0.118.0** (cũ); app Codex đi kèm bản **0.144.0**. Bản cũ không chạy được model của tài khoản ChatGPT | `resolve-codex.sh` dò bản mới nhất. **Không gọi `codex` trực tiếp** |
| `The 'gpt-5-codex' model is not supported when using Codex with a ChatGPT account` | Tài khoản ChatGPT chỉ dùng được model đi kèm | **Đừng ghi đè `model`.** Để config quyết định |
| Chạy treo, không sinh file output | MCP server (`node_repl`, `pencil`) không khởi động được khi headless | `-c 'mcp_servers={}'` |
| Log đỏ `AuthRequired ... mcp.figma.com` | Plugin Figma/Slack/Drive đòi OAuth | **Nhiễu, không phải lỗi.** Lọc bằng `grep -viE "$NOISE"` |
| `failed to load models cache: unknown variant 'max'` | Cache model của bản CLI cũ | Biến mất khi dùng bản mới |
| `invalid_json_schema: 'required' ... Missing 'suggested_fix'` | API bắt `required` phải liệt kê **mọi** key trong `properties` — kể cả key tuỳ chọn | Đưa hết key vào `required`; key tuỳ chọn thì cho phép `null` trong `type` |
| Codex lỗi nhưng `round1.json` vẫn có nội dung | Đó là **file của lần chạy TRƯỚC**. Đọc nhầm sẽ tưởng đã review | 🔒 `rm -f .claude/codex-review/round*.json` trước mỗi lần gọi |

⚠️ Đường dẫn binary app **chứa mã hash và sẽ đổi khi app cập nhật** — đó là lý do
phải dò động bằng `resolve-codex.sh` thay vì hardcode.

### Kiểm tra nhanh trước khi dùng lần đầu

```bash
CODEX=$(bash .claude/codex-review/resolve-codex.sh)
echo '{"type":"object","required":["ok"],"properties":{"ok":{"type":"boolean"}}}' > /tmp/s.json
"$CODEX" exec --sandbox read-only -c 'mcp_servers={}' \
  --output-schema /tmp/s.json -o /tmp/s-out.json "Tra loi JSON ok=true." 2>&1 | tail -2
cat /tmp/s-out.json    # kỳ vọng: {"ok":true}
```
