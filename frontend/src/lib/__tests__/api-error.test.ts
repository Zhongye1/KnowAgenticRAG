import { getApiErrorMessage } from '../api-error';

/** 构造 axios 形状的错误（`isAxiosError` 标记 + 响应体）。 */
const axiosError = (
  data: unknown,
  status?: number,
  message = 'Request failed',
) => ({
  isAxiosError: true,
  message,
  response: status === undefined ? undefined : { status, data },
});

describe('getApiErrorMessage', () => {
  test('fba envelope 的结构化 quota detail（dev 下的 422）拼出原因与建议', () => {
    const message = getApiErrorMessage(
      axiosError(
        {
          code: 422,
          msg: {
            code: 'pdf_too_many_pages',
            reason: 'PDF 共 250 页，超过上限 200 页（MinerU 精提取 API 限制）',
            suggestion: '请将 PDF 拆分为不超过 200 页的多个文件分别摄取',
          },
          data: null,
        },
        422,
      ),
    );

    expect(message).toBe(
      'PDF 共 250 页，超过上限 200 页（MinerU 精提取 API 限制）（请将 PDF 拆分为不超过 200 页的多个文件分别摄取）',
    );
  });

  test('字符串 msg 原样返回', () => {
    expect(
      getApiErrorMessage(
        axiosError({ code: 404, msg: '知识库不存在: kb1' }, 404),
      ),
    ).toBe('知识库不存在: kb1');
  });

  test('FastAPI 原生 422 的 detail 数组被折叠成单行', () => {
    expect(
      getApiErrorMessage(
        axiosError(
          {
            detail: [
              { loc: ['body', 'file'], msg: 'Field required', type: 'missing' },
            ],
          },
          422,
        ),
      ),
    ).toBe('Field required');
  });

  test('网关返回 HTML 错误页时退回状态码提示，不把标记渲染进提示', () => {
    expect(
      getApiErrorMessage(
        axiosError('<html><body>404 Not Found</body></html>', 404),
      ),
    ).toBe('请求的资源不存在或已被删除');
  });

  test('请求没有落地（无响应）时给出网络提示', () => {
    expect(getApiErrorMessage(axiosError(undefined))).toBe(
      '网络异常，请确认网络与服务可用后重试',
    );
  });

  test('拿不到任何线索时回落到调用方文案，且永远是字符串', () => {
    expect(
      getApiErrorMessage(axiosError({ foo: { bar: 1 } }, 418), '操作失败'),
    ).toBe('操作失败');
    expect(getApiErrorMessage(undefined)).toBe('请求失败，请稍后重试');
    expect(typeof getApiErrorMessage(axiosError({ msg: { a: 1 } }, 422))).toBe(
      'string',
    );
  });

  test('非 axios 的普通 Error 用其 message', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe('boom');
  });
});
