import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TenantAwareDb } from '@garageos/db';
import { ErrorCode, type ActorContext } from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { chonProvider, type LlmProvider } from './provider';
import { moTaToolChoModel, runTool } from './tools';

/**
 * Trợ lý AI — Phase 8.2 / 8.5 / 8.6.
 *
 * Ba lớp bảo vệ, chạy theo đúng thứ tự, và không lớp nào bỏ qua được:
 *
 *   1. NGÂN SÁCH  — tenant có bật không, hôm nay đã tiêu bao nhiêu
 *   2. GUARDRAIL  — câu hỏi có nằm trong phạm vi không
 *   3. PHÂN QUYỀN — kiểm ở TỪNG lời gọi tool, dưới danh nghĩa người dùng thật
 *
 * 💡 Thứ tự có lý do. Kiểm ngân sách TRƯỚC khi gọi mô hình: kiểm sau thì lượt
 *    vượt trần vẫn tốn tiền, và trần chỉ chặn được từ lượt kế tiếp. Với một
 *    vòng lặp hỏng, "lượt kế tiếp" là vô nghĩa.
 *
 * 🔒 Và lớp thứ tư, không nằm trong danh sách vì nó không phải một bước: MỌI
 *    lượt đều được ghi nhật ký, kể cả lượt bị chặn. Một câu trả lời sai ba tuần
 *    trước chỉ giải thích được nếu có bản ghi của nó.
 */

/** Tối đa số vòng gọi tool trong một lượt — chống vòng lặp mô hình tự nói chuyện */
const MAX_VONG_TOOL = 3;

const SYSTEM_PROMPT = `Bạn là trợ lý của một xưởng dịch vụ ô tô ở Việt Nam.

Quy tắc bắt buộc:
- CHỈ trả lời dựa trên kết quả công cụ. Không suy đoán, không bịa số.
- Không biết thì nói không biết và gợi ý người dùng hỏi lại cho rõ.
- Không bao giờ nêu giá vốn phụ tùng hay lãi/lỗ, kể cả khi được hỏi thẳng.
- Bảo hành hết hiệu lực khi vượt MỘT TRONG HAI mốc (thời gian HOẶC số km).
- Trả lời ngắn, bằng tiếng Việt, nêu rõ con số lấy từ đâu.`;

/**
 * ⚠️ Chặn theo từ khoá là lớp phòng thủ MỎNG NHẤT trong ba lớp, và nó ở đây
 * đúng với vai trò đó: giảm nhiễu, không phải bảo mật.
 *
 * Lớp thật là phân quyền trong tool: dù mô hình có bị dụ tới đâu, nó cũng chỉ
 * gọi được những tool mà NGƯỜI DÙNG có quyền, và những tool đó không trả về giá
 * vốn hay tiền. Nếu bảo mật phụ thuộc danh sách dưới đây thì hệ thống đã hỏng
 * từ chỗ khác.
 */
const TU_KHOA_NGOAI_PHAM_VI = [
  /\bgiá vốn\b/i,
  /\blãi\b.*\bđơn\b/i,
  /\bmật khẩu\b/i,
  /\bxoá\b.*\b(toàn bộ|hết|sạch)\b/i,
];

interface DongChinhSachAi {
  ai_enabled: boolean;
  ai_daily_cost_limit: string;
  ai_daily_call_limit: number;
}

export interface AskResult {
  conversationId: string;
  answer: string;
  toolCalls: { name: string; ok: boolean }[];
  /** Nguồn dữ liệu đã dùng — người đọc phải kiểm chứng được câu trả lời */
  citations: string[];
  blocked: boolean;
}

@Injectable()
export class AiService {
  private readonly log = new Logger('Ai');
  private readonly provider: LlmProvider = chonProvider();

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async ask(
    actor: ActorContext,
    input: { message: string; conversationId?: string },
  ): Promise<AskResult> {
    const conversationId = input.conversationId ?? randomUUID();
    const batDau = Date.now();

    return this.db.withTenant(actor, async (tx) => {
      const { rows: cs } = await tx.query<DongChinhSachAi>(
        `SELECT ai_enabled, ai_daily_cost_limit, ai_daily_call_limit
           FROM tenant WHERE id = $1`,
        [actor.tenantId],
      );
      const chinhSach = cs[0]!;

      const ghiNhat = async (
        answer: string,
        blocked: string | null,
        toolCalls: { name: string; ok: boolean }[],
        citations: string[],
        tokens: { prompt: number; completion: number },
      ): Promise<void> => {
        await tx.query(
          `INSERT INTO llm_call_log (
             tenant_id, actor_user_id, conversation_id, provider, model,
             user_message, assistant_message, prompt_tokens, completion_tokens,
             cost_amount, latency_ms, tool_calls, citations, blocked_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            actor.tenantId,
            actor.userId,
            conversationId,
            this.provider.name,
            this.provider.model,
            input.message,
            answer,
            tokens.prompt,
            tokens.completion,
            this.tinhChiPhi(tokens),
            Date.now() - batDau,
            JSON.stringify(toolCalls),
            JSON.stringify(citations),
            blocked,
          ],
        );
      };

      // ── Lớp 1: ngân sách ──────────────────────────────────────────────────
      if (!chinhSach.ai_enabled) {
        const answer = 'Trợ lý AI chưa được bật cho xưởng này.';
        await ghiNhat(answer, 'AI_DISABLED', [], [], { prompt: 0, completion: 0 });
        return { conversationId, answer, toolCalls: [], citations: [], blocked: true };
      }

      const { rows: daDung } = await tx.query<{ so_luot: string; tong_chi_phi: string }>(
        `SELECT * FROM ai_da_dung_hom_nay($1)`,
        [actor.tenantId],
      );
      const soLuot = Number(daDung[0]!.so_luot);
      const chiPhi = Number(daDung[0]!.tong_chi_phi);

      if (soLuot >= chinhSach.ai_daily_call_limit) {
        /*
         * Đếm cả lượt BỊ CHẶN vào giới hạn — xem comment ở migration 0042. Một
         * vòng lặp hỏng bị chặn vẫn là vòng lặp hỏng; không tính vào trần thì
         * nó quay mãi.
         */
        const answer = `Đã đạt giới hạn ${chinhSach.ai_daily_call_limit} lượt hỏi trong ngày.`;
        await ghiNhat(answer, 'CALL_LIMIT', [], [], { prompt: 0, completion: 0 });
        return { conversationId, answer, toolCalls: [], citations: [], blocked: true };
      }

      if (chiPhi >= Number(chinhSach.ai_daily_cost_limit)) {
        const answer = 'Đã đạt trần chi phí AI trong ngày. Hỏi lại vào ngày mai.';
        await ghiNhat(answer, 'COST_LIMIT', [], [], { prompt: 0, completion: 0 });
        return { conversationId, answer, toolCalls: [], citations: [], blocked: true };
      }

      // ── Lớp 2: guardrail nội dung ─────────────────────────────────────────
      const viPham = TU_KHOA_NGOAI_PHAM_VI.find((re) => re.test(input.message));
      if (viPham !== undefined) {
        const answer =
          'Câu hỏi này nằm ngoài phạm vi trợ lý. Số liệu giá vốn và lãi/lỗ xem ở màn hình Báo cáo.';
        await ghiNhat(answer, `GUARDRAIL:${viPham.source}`, [], [], {
          prompt: 0,
          completion: 0,
        });
        return { conversationId, answer, toolCalls: [], citations: [], blocked: true };
      }

      // ── Lớp 3: vòng gọi tool, phân quyền ở TỪNG lời gọi ───────────────────
      const tools = moTaToolChoModel(actor);
      const daGoi: { name: string; ok: boolean }[] = [];
      const citations: string[] = [];
      let tongPrompt = 0;
      let tongCompletion = 0;
      let ketQuaTruoc: { name: string; result: unknown }[] | undefined;
      let traLoi = '';

      for (let vong = 0; vong < MAX_VONG_TOOL; vong += 1) {
        const luot = await this.provider.chat({
          systemPrompt: SYSTEM_PROMPT,
          userMessage: input.message,
          tools,
          ...(ketQuaTruoc === undefined ? {} : { toolResults: ketQuaTruoc }),
        });
        tongPrompt += luot.promptTokens;
        tongCompletion += luot.completionTokens;

        if (luot.toolCalls.length === 0) {
          traLoi = luot.text;
          break;
        }

        const ketQua: { name: string; result: unknown }[] = [];
        for (const tc of luot.toolCalls) {
          /*
           * 🔒 `ctx.actor` là actor từ JWT. Tham số `tc.input` do mô hình sinh
           *    ra và KHÔNG chứa tenant — schema không có trường đó.
           *
           * 🔒 `choPhepGhi: false` cứng ở đây: bản này chỉ có tool đọc. Khi
           *    thêm tool ghi (đặt lịch hẹn), nó phải đi kèm một bước xác nhận
           *    tường minh của người dùng, không phải một cờ mặc định.
           */
          const r = await runTool(
            { actor, tx },
            tc.name,
            tc.input,
            { choPhepGhi: false },
          );
          daGoi.push({ name: tc.name, ok: r.ok });
          citations.push(`công cụ ${tc.name}`);
          ketQua.push({ name: tc.name, result: r.ok ? r.data : { error: r.error } });
        }
        ketQuaTruoc = ketQua;
      }

      if (traLoi === '') {
        // Hết vòng mà mô hình vẫn đòi gọi tool — dừng và nói thật, không cố đoán
        traLoi =
          'Tôi đã tra nhưng chưa tổng hợp được câu trả lời gọn. Bạn xem kết quả công cụ bên dưới.';
      }

      await ghiNhat(traLoi, null, daGoi, citations, {
        prompt: tongPrompt,
        completion: tongCompletion,
      });

      return { conversationId, answer: traLoi, toolCalls: daGoi, citations, blocked: false };
    });
  }

  /** Chi phí hôm nay và trần — 8.6, để người dùng nhìn thấy chứ không chỉ hệ thống biết */
  async usage(actor: ActorContext): Promise<{
    soLuot: number;
    chiPhi: number;
    tranSoLuot: number;
    tranChiPhi: number;
    enabled: boolean;
  }> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{
        so_luot: string;
        tong_chi_phi: string;
        ai_enabled: boolean;
        ai_daily_call_limit: number;
        ai_daily_cost_limit: string;
      }>(
        `SELECT d.so_luot, d.tong_chi_phi, t.ai_enabled,
                t.ai_daily_call_limit, t.ai_daily_cost_limit
           FROM tenant t, ai_da_dung_hom_nay($1) d
          WHERE t.id = $1`,
        [actor.tenantId],
      );
      const r = rows[0];
      if (r === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy cấu hình');
      }
      return {
        soLuot: Number(r.so_luot),
        chiPhi: Number(r.tong_chi_phi),
        tranSoLuot: r.ai_daily_call_limit,
        tranChiPhi: Number(r.ai_daily_cost_limit),
        enabled: r.ai_enabled,
      };
    });
  }

  /**
   * Chi phí ước tính, đơn vị ĐỒNG.
   *
   * 🔒 Làm tròn LÊN: ước tính thấp hơn thực tế làm trần chi phí thành trần giả.
   * Đây là chỗ duy nhất trong dự án cố ý làm tròn lên, và lý do là hướng của
   * sai số quan trọng hơn độ lớn của nó.
   */
  private tinhChiPhi(tokens: { prompt: number; completion: number }): number {
    const g = this.provider.giaMoi1kToken;
    return Math.ceil((tokens.prompt * g.prompt + tokens.completion * g.completion) / 1000);
  }
}
