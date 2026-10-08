import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPreviewTypeByContentType,
  isTextPreviewType,
  readFilePreview,
} from '@/features/knowledge-base/lib/file-preview';

import {
  canDeleteFile,
  canOpenFileDetail,
  canPreviewChunks,
  canPreviewOriginal,
  canPreviewParsed,
  getDefaultDetailView,
  canDownloadFile,
  canIndexFile,
  canParseFile,
  canReindexFile,
  canSelectFile,
  FILE_STATUS_FILTER_OPTIONS,
  getCodeLanguageByPath,
  getFilePrimaryAction,
  getPreviewFileExtension,
  getPreviewTypeByPath,
  isProcessingFile,
  normalizeCodeLanguage,
  parseDownloadFilename,
  formatContentCount,
  formatDirname,
  formatFileTableTime,
  formatSearchResultTime,
  getFileStatusSortWeight,
  getFileStatusView,
  splitFilename,
} from '@/features/knowledge-base';

describe('文件状态展示', () => {
  it('已知状态给出中文标签与语义色', () => {
    expect(getFileStatusView('uploaded')).toMatchObject({ label: '待解析' });
    expect(getFileStatusView('error_indexing').label).toBe('重试入库');
    expect(getFileStatusView('indexed').className).toContain('text-success-6');
    expect(getFileStatusView('error_parsing').className).toContain(
      'text-danger-6',
    );
  });

  it('未知状态原样显示标签并走中性色', () => {
    expect(getFileStatusView('unknown_state')).toMatchObject({
      label: 'unknown_state',
      className: 'bg-color-fill-2 text-color-text-2',
    });
  });

  it('缺失状态不崩，显示占位', () => {
    expect(getFileStatusView(null).label).toBe('未知');
    expect(getFileStatusView(undefined).label).toBe('未知');
  });

  it('筛选选项与上游同为 7 项且按处理顺序排列', () => {
    expect(FILE_STATUS_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      'uploaded',
      'parsing',
      'parsed',
      'error_parsing',
      'indexing',
      'indexed',
      'error_indexing',
    ]);
  });
});

describe('文件状态排序权重', () => {
  it('已入库优先于处理中，处理中优先于待处理，失败排最后', () => {
    expect(getFileStatusSortWeight('indexed')).toBeLessThan(
      getFileStatusSortWeight('parsing'),
    );
    expect(getFileStatusSortWeight('parsing')).toBeLessThan(
      getFileStatusSortWeight('uploaded'),
    );
    expect(getFileStatusSortWeight('uploaded')).toBeLessThan(
      getFileStatusSortWeight('error_parsing'),
    );
  });

  it('别名状态与主状态的权重一致', () => {
    // 后端把 indexed 展开成 {indexed, done}，failed 是 error_indexing 的旧别名
    expect(getFileStatusSortWeight('done')).toBe(
      getFileStatusSortWeight('indexed'),
    );
    expect(getFileStatusSortWeight('failed')).toBe(
      getFileStatusSortWeight('error_indexing'),
    );
  });

  it('未登记状态排在已知状态之后', () => {
    expect(getFileStatusSortWeight('weird')).toBeGreaterThan(
      getFileStatusSortWeight('error_parsing'),
    );
    expect(getFileStatusSortWeight(null)).toBe(99);
  });
});

describe('文件表的时间展示', () => {
  beforeEach(() => {
    // 冻结「现在」，否则「一年内」的判定会随真实日期漂移
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T02:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('一年内精确到秒，按上海时区换算', () => {
    expect(formatFileTableTime('2026-10-07T08:42:04Z')).toBe(
      '10月07日 16:42:04',
    );
  });

  it('跨年的只到日并补年份', () => {
    expect(formatFileTableTime('2024-03-05T01:00:00Z')).toBe('2024年03月05日');
  });

  it('后端 str(datetime) 形状没有 T，也按 UTC 解析', () => {
    // 后端 `str(datetime)` 给 `2026-10-07 08:42:04.468047+00:00`，
    // 有些引擎会把它当本地时间，这里必须与 ISO 形状同解
    expect(formatFileTableTime('2026-10-07 08:42:04.468047+00:00')).toBe(
      '10月07日 16:42:04',
    );
    expect(formatFileTableTime('2026-10-07 08:42:04.468047')).toBe(
      '10月07日 16:42:04',
    );
  });

  it('空值与无法解析的值显示 -', () => {
    expect(formatFileTableTime(null)).toBe('-');
    expect(formatFileTableTime('')).toBe('-');
    expect(formatFileTableTime('不是时间')).toBe('-');
  });

  it('正好落在一年前算更早', () => {
    // beforeEach 冻结在 2026-10-08 10:00（上海）
    expect(formatFileTableTime('2025-10-08T02:00:00Z')).toBe('2025年10月08日');
    expect(formatFileTableTime('2025-10-08T02:00:01Z')).toBe(
      '10月08日 10:00:01',
    );
  });

  it('闰日退一年收敛到 2 月 28 日', () => {
    // dayjs 的 subtract(1, 'year') 在 2 月 29 日收敛到 2 月 28 日，直接退年数字
    // 会溢出到 3 月 1 日，让「一年前」的分界差一天
    vi.setSystemTime(new Date('2028-02-29T02:00:00Z'));
    expect(formatFileTableTime('2027-02-28T02:00:00Z')).toBe('2027年02月28日');
    expect(formatFileTableTime('2027-02-28T02:00:01Z')).toBe(
      '02月28日 10:00:01',
    );
  });

  it('搜索结果当年不写年份，跨年补日期', () => {
    expect(formatSearchResultTime('2026-10-07T08:42:04Z')).toBe(
      '10月7日 16:42',
    );
    expect(formatSearchResultTime('2024-03-05T01:00:00Z')).toBe(
      '2024-03-05 09:00',
    );
    expect(formatSearchResultTime(null)).toBe('');
  });
});

describe('文件内容量与路径', () => {
  it('内容量按 k/m 进制，不足千位用千分位', () => {
    expect(formatContentCount(0)).toBe('0');
    expect(formatContentCount(999)).toBe('999');
    expect(formatContentCount(1200)).toBe('1.2k');
    expect(formatContentCount(1_500_000)).toBe('1.5m');
  });

  it('拆分完整相对路径', () => {
    expect(splitFilename('brief/docs/a.md')).toEqual({
      basename: 'a.md',
      dirname: 'brief/docs',
    });
    expect(splitFilename('a.md')).toEqual({ basename: 'a.md', dirname: '' });
    expect(splitFilename(null)).toEqual({ basename: '', dirname: '' });
  });

  it('过长的目录前缀只留尾部', () => {
    const long = `a/${'深'.repeat(60)}`;
    expect(formatDirname('brief/docs')).toBe('brief/docs');
    const formatted = formatDirname(long);
    expect(formatted.startsWith('...')).toBe(true);
    expect(formatted.endsWith('深')).toBe(true);
    expect(formatted.length).toBe(48);
  });
});

describe('文件能力矩阵', () => {
  const file = (status: string, extra: Record<string, unknown> = {}) => ({
    is_folder: false,
    status,
    file_type: 'md',
    ...extra,
  });
  const folder = { is_folder: true, status: 'done', file_type: 'folder' };

  it('只有待解析与重试解析能提交解析', () => {
    expect(canParseFile(file('uploaded'))).toBe(true);
    expect(canParseFile(file('error_parsing'))).toBe(true);
    expect(canParseFile(file('parsed'))).toBe(false);
    expect(canParseFile(file('indexed'))).toBe(false);
  });

  it('待入库、重试入库与已入库能提交入库', () => {
    expect(canIndexFile(file('parsed'))).toBe(true);
    expect(canIndexFile(file('error_indexing'))).toBe(true);
    expect(canIndexFile(file('indexed'))).toBe(true);
    expect(canIndexFile(file('uploaded'))).toBe(false);
  });

  it('只有已入库能重新入库', () => {
    expect(canReindexFile(file('indexed'))).toBe(true);
    expect(canReindexFile(file('done'))).toBe(true);
    expect(canReindexFile(file('parsed'))).toBe(false);
  });

  it('下载排除 URL 类型与还没有解析结果的状态', () => {
    expect(canDownloadFile(file('indexed'))).toBe(true);
    expect(canDownloadFile(file('parsed'))).toBe(true);
    expect(canDownloadFile(file('error_indexing'))).toBe(true);
    expect(canDownloadFile(file('uploaded'))).toBe(false);
    expect(canDownloadFile(file('indexed', { file_type: 'url' }))).toBe(false);
  });

  it('处理中的行不能勾选', () => {
    expect(canSelectFile(file('processing'))).toBe(false);
    expect(canSelectFile(file('waiting'))).toBe(false);
    expect(canSelectFile(file('parsing'))).toBe(true);
    expect(canSelectFile(file('indexed'))).toBe(true);
  });

  it('解析与入库进行中的行不能删除（比可勾选更严）', () => {
    expect(canDeleteFile(file('parsing'))).toBe(false);
    expect(canDeleteFile(file('indexing'))).toBe(false);
    expect(canDeleteFile(file('processing'))).toBe(false);
    expect(canDeleteFile(file('uploaded'))).toBe(true);
    expect(canDeleteFile(file('error_parsing'))).toBe(true);
  });

  it('有操作在飞行中时勾选与删除都关闭', () => {
    expect(canSelectFile(file('indexed'), true)).toBe(false);
    expect(canDeleteFile(file('indexed'), true)).toBe(false);
  });

  it('目录与空值没有主操作，也不能选不能删不能下载', () => {
    // 目录带一个「本该有主操作」的状态，证明判定与状态无关
    const busyFolder = {
      is_folder: true,
      status: 'parsed',
      file_type: 'folder',
    };
    for (const target of [folder, busyFolder, null, undefined]) {
      expect(getFilePrimaryAction(target)).toBeNull();
      expect(canParseFile(target)).toBe(false);
      expect(canIndexFile(target)).toBe(false);
      expect(canDeleteFile(target)).toBe(false);
      expect(canSelectFile(target)).toBe(false);
      expect(canDownloadFile(target)).toBe(false);
    }
  });

  it('主操作按状态给出解析或入库', () => {
    expect(getFilePrimaryAction(file('uploaded'))).toEqual({
      type: 'parse',
      label: '解析文件',
    });
    expect(getFilePrimaryAction(file('error_parsing'))).toEqual({
      type: 'parse',
      label: '重试解析',
    });
    expect(getFilePrimaryAction(file('parsed'))).toEqual({
      type: 'index',
      label: '入库',
    });
    expect(getFilePrimaryAction(file('error_indexing'))).toEqual({
      type: 'index',
      label: '重试入库',
    });
    expect(getFilePrimaryAction(file('indexed'))).toBeNull();
  });

  it('处理中状态覆盖解析与入库两类', () => {
    expect(isProcessingFile(file('parsing'))).toBe(true);
    expect(isProcessingFile(file('indexing'))).toBe(true);
    expect(isProcessingFile(file('processing'))).toBe(true);
    expect(isProcessingFile(file('waiting'))).toBe(true);
    expect(isProcessingFile(file('indexed'))).toBe(false);
  });
});

describe('下载文件名', () => {
  it('优先取 RFC 5987 的编码名', () => {
    expect(
      parseDownloadFilename(
        `attachment; filename*=UTF-8''${encodeURIComponent('年度报表.pdf')}`,
      ),
    ).toBe('年度报表.pdf');
  });

  it('回退到带引号的名字并解码', () => {
    expect(parseDownloadFilename('attachment; filename="brief%2Fa.md"')).toBe(
      'brief/a.md',
    );
    expect(parseDownloadFilename('attachment; filename=plain.md')).toBe(
      'plain.md',
    );
  });

  it('没有响应头或用不出的编码时返回 null，由界面兜底', () => {
    expect(parseDownloadFilename(null)).toBeNull();
    expect(parseDownloadFilename('attachment')).toBeNull();
    expect(parseDownloadFilename(`attachment; filename*=UTF-8''%E4%B8`)).toBe(
      null,
    );
  });
});

describe('预览能力', () => {
  const file = (status: string, extra: Record<string, unknown> = {}) => ({
    is_folder: false,
    status,
    file_type: 'md',
    ...extra,
  });
  const folder = { is_folder: true, status: 'done', file_type: 'folder' };

  it('解析结果以行上的事实为准，缺字段才按状态兜底', () => {
    expect(
      canPreviewParsed(file('indexed', { has_parsed_markdown: true })),
    ).toBe(true);
    // 状态看着能看，但后端说没有解析结果
    expect(
      canPreviewParsed(file('indexed', { has_parsed_markdown: false })),
    ).toBe(false);
    // 搜索结果这类列不出来源的记录按状态兜底
    expect(canPreviewParsed(file('parsed'))).toBe(true);
    expect(canPreviewParsed(file('error_parsing'))).toBe(false);
    expect(canPreviewParsed(folder)).toBe(false);
  });

  it('源文件以行上的事实为准，URL 类型永远没有', () => {
    expect(
      canPreviewOriginal(file('uploaded', { has_original_file: true })),
    ).toBe(true);
    expect(
      canPreviewOriginal(file('indexed', { has_original_file: false })),
    ).toBe(false);
    expect(canPreviewOriginal(file('indexed'))).toBe(true);
    expect(canPreviewOriginal(file('indexed', { file_type: 'url' }))).toBe(
      false,
    );
    expect(canPreviewOriginal(folder)).toBe(false);
  });

  it('只有已入库的行能看分块', () => {
    expect(canPreviewChunks(file('indexed'))).toBe(true);
    expect(canPreviewChunks(file('done'))).toBe(true);
    expect(canPreviewChunks(file('parsed'))).toBe(false);
    expect(canPreviewChunks(file('error_indexing'))).toBe(false);
    expect(canPreviewChunks(folder)).toBe(false);
  });

  it('有解析结果，或只有源文件可看时才能打开详情', () => {
    expect(
      canOpenFileDetail(file('indexed', { has_parsed_markdown: true })),
    ).toBe(true);
    expect(
      canOpenFileDetail(file('uploaded', { has_original_file: true })),
    ).toBe(true);
    // 只有源文件可看的档位，但没有原始文件 → 不能打开
    expect(
      canOpenFileDetail(file('uploaded', { has_original_file: false })),
    ).toBe(false);
    expect(canOpenFileDetail(file('parsing'))).toBe(false);
    expect(canOpenFileDetail(folder)).toBe(false);
  });

  it('初始视图：只有源文件时看源文件，否则看解析结果', () => {
    expect(
      getDefaultDetailView(file('uploaded', { has_original_file: true })),
    ).toBe('source');
    expect(
      getDefaultDetailView(file('indexed', { has_parsed_markdown: true })),
    ).toBe('markdown');
  });
});

describe('预览类型与代码语言映射', () => {
  it('按扩展名给出预览类型', () => {
    expect(getPreviewTypeByPath('brief/报表.PDF')).toBe('pdf');
    expect(getPreviewTypeByPath('a/b/照片.png')).toBe('image');
    expect(getPreviewTypeByPath('说明.md')).toBe('markdown');
    expect(getPreviewTypeByPath('页面.html')).toBe('html');
    expect(getPreviewTypeByPath('方案.docx')).toBe('office');
    expect(getPreviewTypeByPath('scripts/run.sh')).toBe('text');
    expect(getPreviewTypeByPath('archive.zip')).toBe('unsupported');
    expect(getPreviewTypeByPath('')).toBe('unsupported');
    expect(getPreviewTypeByPath(null)).toBe('unsupported');
  });

  it('扩展名取法覆盖无扩展名与点开头的文件', () => {
    expect(getPreviewFileExtension('Dockerfile')).toBe('');
    expect(getPreviewFileExtension('.gitignore')).toBe('');
    expect(getPreviewFileExtension('a/b/c.TAR.GZ'.toLowerCase())).toBe('.gz');
    expect(getPreviewFileExtension('brief/报表.pdf')).toBe('.pdf');
  });

  it('按扩展名给出高亮语言，别名归一', () => {
    expect(getCodeLanguageByPath('a.py')).toBe('python');
    expect(getCodeLanguageByPath('a.tsx')).toBe('tsx');
    expect(getCodeLanguageByPath('a.vue')).toBe('xml');
    expect(getCodeLanguageByPath('a.yml')).toBe('yaml');
    expect(getCodeLanguageByPath('a.unknown')).toBe('');
    expect(getCodeLanguageByPath('Dockerfile')).toBe('');
    expect(normalizeCodeLanguage('PY')).toBe('python');
    expect(normalizeCodeLanguage('shell')).toBe('bash');
    // 上游只按空格/冒号/逗号切（不按 `/`），带斜杠的值原样返回
    expect(normalizeCodeLanguage('python 3')).toBe('python');
    expect(normalizeCodeLanguage('text/plain')).toBe('text/plain');
  });

  it('按 Content-Type 兜底', () => {
    expect(getPreviewTypeByContentType('application/pdf')).toBe('pdf');
    expect(getPreviewTypeByContentType('image/webp')).toBe('image');
    expect(getPreviewTypeByContentType('text/markdown; charset=utf-8')).toBe(
      'markdown',
    );
    expect(getPreviewTypeByContentType('text/plain')).toBe('text');
    expect(getPreviewTypeByContentType('application/json')).toBe('json');
    expect(getPreviewTypeByContentType('application/octet-stream')).toBe(
      'unsupported',
    );
  });

  it('文本类才按文本渲染', () => {
    expect(isTextPreviewType('text')).toBe(true);
    expect(isTextPreviewType('markdown')).toBe(true);
    expect(isTextPreviewType('json')).toBe(true);
    expect(isTextPreviewType('pdf')).toBe(false);
    expect(isTextPreviewType('image')).toBe(false);
    expect(isTextPreviewType('unsupported')).toBe(false);
  });
});

describe('预览响应归一', () => {
  const json = (body: unknown, contentType = 'application/json') =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': contentType },
    });

  it('文本类 JSON 给内容，路径用来兜底类型', async () => {
    const preview = await readFilePreview(
      json({ content: '# 标题', supported: true, truncated: true }),
      { filename: 'brief/说明.md' },
    );

    expect(preview).toMatchObject({
      previewType: 'markdown',
      content: '# 标题',
      blob: null,
      truncated: true,
      supported: true,
    });
  });

  it('后端说不支持时保留原因', async () => {
    const preview = await readFilePreview(
      json({
        content: null,
        preview_type: 'unsupported',
        supported: false,
        message: '当前文件是二进制文件，暂不支持预览',
      }),
      { filename: 'a.bin' },
    );

    expect(preview.supported).toBe(false);
    expect(preview.message).toBe('当前文件是二进制文件，暂不支持预览');
    expect(preview.content).toBeNull();
  });

  it('二进制类按响应头给类型与文件名', async () => {
    const preview = await readFilePreview(
      new Response('PDF', {
        headers: {
          'content-type': 'application/pdf',
          'X-Ars-Preview-Type': 'pdf',
          'X-Ars-Preview-Filename': encodeURIComponent('年度报表.pdf'),
        },
      }),
      { filename: 'fallback.pdf' },
    );

    expect(preview).toMatchObject({
      previewType: 'pdf',
      filename: '年度报表.pdf',
      content: null,
      supported: true,
    });
    expect(await preview.blob?.text()).toBe('PDF');
  });

  it('没有类型头时按 Content-Type 兜底，仍不认识就标不支持', async () => {
    const image = await readFilePreview(
      new Response('IMG', { headers: { 'content-type': 'image/png' } }),
      { filename: 'x.png' },
    );
    expect(image.previewType).toBe('image');

    const unknown = await readFilePreview(
      new Response('BIN', {
        headers: { 'content-type': 'application/octet-stream' },
      }),
      { filename: 'x.bin' },
    );
    expect(unknown.previewType).toBe('unsupported');
    expect(unknown.supported).toBe(false);
    expect(unknown.message).toBe('当前文件暂不支持预览，请下载后查看');
  });

  it('文本类的二进制响应按文本读出来', async () => {
    const preview = await readFilePreview(
      new Response('纯文本', { headers: { 'content-type': 'text/plain' } }),
      { filename: 'brief/a.txt' },
    );

    expect(preview.previewType).toBe('text');
    expect(preview.content).toBe('纯文本');
    expect(preview.blob).toBeNull();
  });
});
