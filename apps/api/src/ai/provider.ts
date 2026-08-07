/**
 * Adapter mô hình ngôn ngữ — cùng khuôn với adapter hoá đơn điện tử
 * ([ADR-0005](../../../../docs/adr/0005-einvoice-adapter.md)).
 *
 * 🔒 Toàn bộ tầng AI của dự án này KHÔNG phụ thuộc vào một nhà cung cấp cụ thể,
 * và quan trọng hơn: nó CHẠY ĐƯỢC và TEST ĐƯỢC khi chưa có khoá API nào.
 *
 * 💡 Đây không phải sự tiện lợi mà là điều kiện để phần còn lại của Phase 8 có
 *    giá trị. Ba thứ đáng làm ở tầng AI — phân quyền trong tool, giới hạn chi
 *    phí, nhật ký lời gọi — đều không cần mô hình thật để kiểm chứng. Buộc
 *    chúng vào một khoá API là biến chúng thành thứ không ai chạy được test.
 *
 * `MockProvider` KHÔNG phải bản giả tạm bợ: nó quyết định gọi tool nào bằng
 * luật rõ ràng, nên bộ eval ở 8.4 chạy được trong CI và bắt được hồi quy ở
 * tầng tool — phần mà một mô hình thật chỉ làm nhiễu chứ không kiểm được.
 */

export interface ToolCallRequest {
  name: string;
  input: unknown;
}

export interface LlmTurn {
  /** Mô hình muốn gọi tool trước khi trả lời */
  toolCalls: ToolCallRequest[];
  /** Câu trả lời cuối — rỗng khi còn muốn gọi tool */
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** Giá mỗi 1000 token, đơn vị ĐỒNG — để tính chi phí bằng cùng đơn vị mọi nơi */
  readonly giaMoi1kToken: { prompt: number; completion: number };

  chat(input: {
    systemPrompt: string;
    userMessage: string;
    tools: { name: string; description: string; parameters: unknown }[];
    /** Kết quả tool của lượt trước, nếu có */
    toolResults?: { name: string; result: unknown }[];
  }): Promise<LlmTurn>;
}

/**
 * Bản chạy được khi không có khoá API.
 *
 * Cách chọn tool bằng từ khoá — thô, nhưng ĐỦ và ĐÚNG cho việc nó phải làm:
 * chứng minh rằng khi một tool được gọi, tầng phân quyền, tầng ngân sách và
 * tầng nhật ký hành xử đúng. Nó không giả vờ hiểu tiếng Việt.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'mock-1';
  // Giá 0: bản mock không tốn tiền, và ngân sách không được tính nhầm vì nó
  readonly giaMoi1kToken = { prompt: 0, completion: 0 };

  chat(input: {
    systemPrompt: string;
    userMessage: string;
    tools: { name: string; description: string; parameters: unknown }[];
    toolResults?: { name: string; result: unknown }[];
  }): Promise<LlmTurn> {
    const co = (n: string): boolean => input.tools.some((t) => t.name === n);
    const hoi = input.userMessage.toLowerCase();
    const uocTokens = Math.ceil((input.systemPrompt.length + input.userMessage.length) / 4);

    // Lượt sau khi đã có kết quả tool: tóm tắt lại, không gọi thêm
    if (input.toolResults !== undefined && input.toolResults.length > 0) {
      return Promise.resolve({
        toolCalls: [],
        text: this.tomTat(input.toolResults),
        promptTokens: uocTokens,
        completionTokens: 40,
      });
    }

    const bienSo = /\b\d{2}[a-z]{1,2}[-\s]?\d{3}\.?\d{2}\b/i.exec(input.userMessage)?.[0];

    if (/bảo hành/.test(hoi) && bienSo !== undefined && co('check_warranty')) {
      const km = /(\d{4,7})\s*km/i.exec(input.userMessage)?.[1];
      return Promise.resolve({
        toolCalls: [
          {
            name: 'check_warranty',
            input: {
              plateNumber: bienSo,
              ...(km === undefined ? {} : { currentOdometer: Number(km) }),
            },
          },
        ],
        text: '',
        promptTokens: uocTokens,
        completionTokens: 20,
      });
    }

    if (/lịch sử|đã sửa|lần trước/.test(hoi) && bienSo !== undefined && co('lookup_vehicle_history')) {
      return Promise.resolve({
        toolCalls: [{ name: 'lookup_vehicle_history', input: { plateNumber: bienSo } }],
        text: '',
        promptTokens: uocTokens,
        completionTokens: 20,
      });
    }

    if (/còn hàng|tồn kho|còn không/.test(hoi) && co('check_part_availability')) {
      const tu = input.userMessage.split(/\s+/).filter((w) => w.length >= 3);
      return Promise.resolve({
        toolCalls: [
          { name: 'check_part_availability', input: { search: tu[tu.length - 1] ?? 'lọc' } },
        ],
        text: '',
        promptTokens: uocTokens,
        completionTokens: 20,
      });
    }

    if (/khoang|lịch trống|xếp lịch/.test(hoi) && co('find_available_slots')) {
      const ngay = /\d{4}-\d{2}-\d{2}/.exec(input.userMessage)?.[0];
      return Promise.resolve({
        toolCalls: [
          {
            name: 'find_available_slots',
            input: { date: ngay ?? new Date().toISOString().slice(0, 10) },
          },
        ],
        text: '',
        promptTokens: uocTokens,
        completionTokens: 20,
      });
    }

    if (/nằm lâu|chưa lấy|bỏ quên/.test(hoi) && co('list_waiting_vehicles')) {
      return Promise.resolve({
        toolCalls: [{ name: 'list_waiting_vehicles', input: {} }],
        text: '',
        promptTokens: uocTokens,
        completionTokens: 20,
      });
    }

    /*
     * 🔒 Không biết thì nói không biết.
     *
     * Đây là hành vi mặc định ĐÚNG, không phải hành vi tạm. Một trợ lý bịa ra
     * câu trả lời về bảo hành hay tồn kho gây thiệt hại lớn hơn nhiều so với
     * một trợ lý nói "tôi không tra được".
     */
    return Promise.resolve({
      toolCalls: [],
      text:
        'Tôi chưa tra được thông tin cho câu hỏi này. Hãy nêu rõ biển số xe, ' +
        'hoặc hỏi về: lịch sử sửa chữa, bảo hành, tồn kho phụ tùng, khoang trống, ' +
        'hoặc xe đang nằm chờ khách tới lấy.',
      promptTokens: uocTokens,
      completionTokens: 30,
    });
  }

  private tomTat(results: { name: string; result: unknown }[]): string {
    return results
      .map((r) => {
        const soDong = Array.isArray(r.result) ? r.result.length : 1;
        return `${r.name}: ${soDong} kết quả`;
      })
      .join(' · ');
  }
}

/**
 * Chọn adapter theo môi trường.
 *
 * ⚠️ Chưa có bản gọi nhà cung cấp thật: cần khoá API và ngân sách token, đã ghi
 *    ở `CAN-BAN-CUNG-CAP.md` mục 6. Khi có khoá, thêm một lớp cài `LlmProvider`
 *    ở đây là đủ — không chỗ nào khác phải sửa, vì không chỗ nào khác biết nhà
 *    cung cấp là ai.
 */
export function chonProvider(): LlmProvider {
  return new MockProvider();
}
