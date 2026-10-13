import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OCR_ENGINE,
  MAX_ATTACHMENT_SIZE_BYTES,
  canConfirm,
  confirmableItems,
  getDefaultParseMethod,
  hasBusyItems,
  isBusyItem,
  normalizeTmpUpload,
  pendingAttachmentFileIds,
  toConfirmPayload,
  validateAttachmentFile,
  type AttachmentItem,
} from '@/features/chat/lib/attachment-upload';

const item = (patch: Partial<AttachmentItem> = {}): AttachmentItem => ({
  localId: 'a',
  fileName: 'a.pdf',
  fileSize: 10,
  fileType: 'application/pdf',
  objectName: 'tmp/a.pdf',
  parseSupported: true,
  parseMethods: ['disable', 'rapid_ocr'],
  selectedParseMethod: 'rapid_ocr',
  parsedObjectName: null,
  status: 'uploaded',
  error: null,
  parseError: null,
  ...patch,
});

describe('validateAttachmentFile', () => {
  it('恰好等于上限时通过，多一个字节就拒绝', () => {
    expect(validateAttachmentFile({ name: 'a', size: MAX_ATTACHMENT_SIZE_BYTES })).toBeNull();
    expect(
      validateAttachmentFile({ name: 'a', size: MAX_ATTACHMENT_SIZE_BYTES + 1 }),
    ).toContain('5 MB');
  });

  it('上限是 5 MB，与后端同值', () => {
    expect(MAX_ATTACHMENT_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe('getDefaultParseMethod', () => {
  it('配置值在可选项里时用它，优先于 rapid_ocr 兜底', () => {
    // 可选项里同时有配置值与 rapid_ocr 时，取配置值
    expect(
      getDefaultParseMethod(['disable', 'paddle_ocr', DEFAULT_OCR_ENGINE], 'paddle_ocr'),
    ).toBe('paddle_ocr');
    expect(getDefaultParseMethod(['disable', 'paddle_ocr'], 'paddle_ocr')).toBe('paddle_ocr');
  });

  it('配置成 disable 且可选项里有它时取 disable', () => {
    expect(getDefaultParseMethod(['disable', 'paddle_ocr'], 'disable')).toBe('disable');
  });

  it('配置值不在可选项里时回退到 rapid_ocr', () => {
    expect(getDefaultParseMethod(['disable', 'paddle_ocr', DEFAULT_OCR_ENGINE], 'nope')).toBe(
      DEFAULT_OCR_ENGINE,
    );
  });

  it('没有 rapid_ocr 时取第一个非 disable 项', () => {
    expect(getDefaultParseMethod(['disable', 'paddle_ocr', 'other'], 'nope')).toBe('paddle_ocr');
  });

  it('图片那种不带 disable 的列表也能取到值', () => {
    expect(getDefaultParseMethod([DEFAULT_OCR_ENGINE], null)).toBe(DEFAULT_OCR_ENGINE);
  });

  it('空列表或形状不符时返回 null', () => {
    expect(getDefaultParseMethod([], 'rapid_ocr')).toBeNull();
    expect(getDefaultParseMethod(null, 'rapid_ocr')).toBeNull();
    expect(getDefaultParseMethod(['disable'], 'nope')).toBeNull();
  });
});

describe('条目状态判定', () => {
  it('上传中与解析中算在途', () => {
    expect(isBusyItem(item({ status: 'uploading' }))).toBe(true);
    expect(isBusyItem(item({ status: 'parsing' }))).toBe(true);
    expect(isBusyItem(item({ status: 'uploaded' }))).toBe(false);
    expect(isBusyItem(item({ status: 'error' }))).toBe(false);
  });

  it('可确认的是已上传与已解析', () => {
    const items = [
      item({ localId: 'a', status: 'uploaded' }),
      item({ localId: 'b', status: 'parsed' }),
      item({ localId: 'c', status: 'error' }),
      item({ localId: 'd', status: 'parsing' }),
    ];

    expect(confirmableItems(items).map((entry) => entry.localId)).toEqual(['a', 'b']);
  });

  it('有在途条目或没有可确认条目时不能确认', () => {
    expect(canConfirm([item({ status: 'uploaded' })])).toBe(true);
    expect(canConfirm([item({ status: 'uploaded' }), item({ status: 'uploading' })])).toBe(false);
    expect(canConfirm([item({ status: 'error' })])).toBe(false);
    expect(canConfirm([])).toBe(false);
    expect(hasBusyItems([])).toBe(false);
  });

  it('确认载荷只带可确认的条目，并带上解析结果', () => {
    const items = [
      item({
        localId: 'a',
        objectName: 'tmp/first.pdf',
        status: 'parsed',
        parsedObjectName: 'tmp/first.parsed.md',
      }),
      item({ localId: 'b', objectName: 'tmp/second.pdf', status: 'uploaded' }),
      item({ localId: 'c', objectName: 'tmp/failed.pdf', status: 'error' }),
    ];

    // 两条目的对象名不同：用第一条填满两条也能「通过」的断言没有区分度
    expect(toConfirmPayload(items)).toEqual([
      {
        file_type: 'application/pdf',
        object_name: 'tmp/first.pdf',
        parsed_object_name: 'tmp/first.parsed.md',
      },
      {
        file_type: 'application/pdf',
        object_name: 'tmp/second.pdf',
        parsed_object_name: null,
      },
    ]);
  });
});

describe('normalizeTmpUpload', () => {
  it('取真实响应的字段，并按配置选默认解析方式', () => {
    expect(
      normalizeTmpUpload(
        {
          file_name: 'a.pdf',
          file_type: 'application/pdf',
          file_size: 12,
          object_name: 'tmp/a.pdf',
          parse_supported: true,
          parse_methods: ['disable', 'rapid_ocr'],
        },
        'disable',
      ),
    ).toEqual({
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 12,
      objectName: 'tmp/a.pdf',
      parseSupported: true,
      parseMethods: ['disable', 'rapid_ocr'],
      selectedParseMethod: 'disable',
    });
  });

  it('形状不符时给出空字段而不是抛错', () => {
    expect(normalizeTmpUpload(null, 'rapid_ocr')).toEqual({
      fileName: '',
      fileType: '',
      fileSize: 0,
      objectName: '',
      parseSupported: false,
      parseMethods: [],
      selectedParseMethod: null,
    });
  });

  it('parse_methods 里的非字符串项被丢掉', () => {
    expect(
      normalizeTmpUpload({ parse_methods: ['rapid_ocr', 1, null] }, 'rapid_ocr')
        .parseMethods,
    ).toEqual(['rapid_ocr']);
  });
});

describe('pendingAttachmentFileIds', () => {
  it('只取还没被请求用掉的附件', () => {
    expect(
      pendingAttachmentFileIds([
        { fileId: 'f-1', fileName: '', fileType: '', fileSize: 0, status: '', requestId: null },
        { fileId: 'f-2', fileName: '', fileType: '', fileSize: 0, status: '', requestId: 'req-1' },
        { fileId: 'f-3', fileName: '', fileType: '', fileSize: 0, status: '', requestId: null },
      ]),
    ).toEqual(['f-1', 'f-3']);
  });

  it('空列表与空 id 都返回空数组', () => {
    expect(pendingAttachmentFileIds([])).toEqual([]);
    expect(
      pendingAttachmentFileIds([
        { fileId: '', fileName: '', fileType: '', fileSize: 0, status: '', requestId: null },
      ]),
    ).toEqual([]);
  });
});
