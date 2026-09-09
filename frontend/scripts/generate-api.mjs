#!/usr/bin/env node
/**
 * 根据 FastAPI 导出的 OpenAPI 文档（apidoc）自动生成前端 TypeScript 接口代码。
 *
 * 用法:
 *   node scripts/generate-api.mjs [--spec <path|url>] [--out <dir>] [--api-prefix <prefix>]
 *
 * 默认:
 *   --spec        http://127.0.0.1:8000/openapi   （后端 FastAPI 导出的 OpenAPI 文档）
 *   --out         src/generated              （生成产物目录）
 *   --api-prefix  /api/v1                    （后端 API 版本前缀）
 *
 * 生成内容:
 *   src/generated/types.ts                    全部 Schema 类型 + ApiResponse/PageData 泛型
 *   src/generated/<feature>/<operation>.ts    每个端点一个模块：axios 请求函数 + React Query hook
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HEADER = `/**
 * AUTO-GENERATED from backend OpenAPI (apidoc). DO NOT EDIT.
 * Regenerate with: pnpm generate:api
 */
`;

// ---------------------------------------------------------------------------
// 命令行参数
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    spec: 'http://127.0.0.1:8000/openapi',
    out: path.join(ROOT, 'src', 'generated'),
    apiPrefix: '/api/v1',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--spec') args.spec = value;
    if (flag === '--out') args.out = value;
    if (flag === '--api-prefix') args.apiPrefix = value;
  }
  return args;
}

// ---------------------------------------------------------------------------
// 加载 OpenAPI 文档
// ---------------------------------------------------------------------------

async function loadSpec(specPath) {
  if (/^https?:\/\//.test(specPath)) {
    const res = await fetch(specPath);
    if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(specPath, 'utf8'));
}

// ---------------------------------------------------------------------------
// 命名工具
// ---------------------------------------------------------------------------

const camelCase = (s) => s.replace(/_+([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascalCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kebabCase = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const sanitizeTypeName = (name) => name.replace(/[^A-Za-z0-9_]/g, '_');

// ---------------------------------------------------------------------------
// OpenAPI 类型名 → TS 类型
// 处理 fba 泛型命名：ResponseSchemaModel_X_ / PageData_X_ / list_X_ / dict_str__X_ / Union_A___NoneType_
// ---------------------------------------------------------------------------

const BUILTINS = {
  str: 'string',
  int: 'number',
  float: 'number',
  bool: 'boolean',
  bytes: 'string',
  Any: 'unknown',
  NoneType: 'null',
  JsonValue: 'unknown',
};

function makeTypeParser(schemaNames) {
  const schemaSet = new Set(schemaNames);
  const aliases = { _Links: 'Links' };

  function parseTypeName(name) {
    if (!name) return 'unknown';
    if (aliases[name]) return aliases[name];
    if (BUILTINS[name]) return BUILTINS[name];

    let m = name.match(/^list_(.+)_$/);
    if (m) {
      const inner = parseTypeName(m[1]);
      return inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
    }

    m = name.match(/^PageData_(.+)_$/);
    if (m) return `PageData<${parseTypeName(m[1])}>`;

    m = name.match(/^ResponseSchemaModel_(.+)_$/);
    if (m) return `ApiResponse<${parseTypeName(m[1])}>`;

    m = name.match(/^dict_(.+?)__(.+)_$/);
    if (m) return `Record<${parseTypeName(m[1])}, ${parseTypeName(m[2])}>`;

    m = name.match(/^Union_(.+)_$/);
    if (m) {
      const inner = m[1];
      if (inner.endsWith('__NoneType_')) {
        return `${parseTypeName(inner.slice(0, -'__NoneType_'.length))} | null`;
      }
      return 'unknown';
    }

    // 普通 schema 名（在泛型模式之后判断，避免 PageData_X_ 等包装名被当成普通类型）
    if (schemaSet.has(name)) return sanitizeTypeName(name);

    if (name.endsWith('_')) return parseTypeName(name.slice(0, -1));
    return 'unknown';
  }

  /** 解析 200 响应 `$ref`，解包统一响应模型，返回 data 字段的 TS 类型 */
  function unwrapResponse(refName) {
    const name = refName.split('/').pop();
    if (!name || name === 'ResponseModel') return 'unknown';
    const m = name.match(/^ResponseSchemaModel_(.+)_$/);
    return m ? parseTypeName(m[1]) : parseTypeName(name);
  }

  /** 从类型字符串中提取引用的 schema 名（用于生成 import） */
  function referencedTypes(...typeStrings) {
    const found = new Set();
    for (const str of typeStrings) {
      if (!str) continue;
      for (const name of schemaSet) {
        if (new RegExp(`\\b${name}\\b`).test(str)) found.add(sanitizeTypeName(name));
      }
      for (const generic of ['ApiResponse', 'PageData', 'ResponseModel', 'Links']) {
        if (new RegExp(`\\b${generic}\\b`).test(str)) found.add(generic);
      }
    }
    return [...found].sort();
  }

  return { parseTypeName, unwrapResponse, referencedTypes };
}

// ---------------------------------------------------------------------------
// Schema 对象 → TS 类型
// ---------------------------------------------------------------------------

function makeSchemaMapper({ parseTypeName }) {
  function joinUnique(parts) {
    return [...new Set(parts.filter(Boolean))].join(' | ');
  }

  function mapSchema(schema) {
    if (!schema || typeof schema !== 'object') return 'unknown';
    if (schema.$ref) return parseTypeName(schema.$ref.split('/').pop());
    if (schema.anyOf || schema.oneOf) {
      const parts = (schema.anyOf || schema.oneOf).map(mapSchema);
      return joinUnique(parts) || 'unknown';
    }
    if (schema.allOf) {
      const parts = schema.allOf.map(mapSchema);
      return parts.length === 1 ? parts[0] : parts.join(' & ');
    }
    if (schema.type === 'array') {
      const inner = mapSchema(schema.items || {});
      return inner.includes(' | ') ? `(${inner})[]` : `${inner}[]`;
    }
    if (schema.type === 'object') {
      if (schema.properties && Object.keys(schema.properties).length > 0) {
        const required = new Set(schema.required || []);
        const props = Object.entries(schema.properties)
          .map(([key, prop]) => `${key}${required.has(key) ? '' : '?'}: ${mapSchema(prop)}`)
          .join('; ');
        return `{ ${props} }`;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return `Record<string, ${mapSchema(schema.additionalProperties)}>`;
      }
      return 'Record<string, unknown>';
    }
    if (schema.type === 'integer' || schema.type === 'number') return 'number';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'null') return 'null';
    if (schema.type === 'string') {
      if (schema.contentMediaType === 'application/octet-stream' || schema.format === 'binary') return 'File';
      return 'string';
    }
    if (schema.enum) {
      return schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
    }
    return 'unknown';
  }

  return mapSchema;
}

// ---------------------------------------------------------------------------
// 收集端点信息
// ---------------------------------------------------------------------------

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectOperations(spec, apiPrefix, { unwrapResponse, mapSchema }) {
  const ops = [];
  const paths = spec.paths || {};
  for (const pathKey of Object.keys(paths).sort()) {
    for (const method of Object.keys(paths[pathKey]).sort()) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
      const op = paths[pathKey][method];
      if (!op.operationId) continue;

      const relPath = pathKey.replace(new RegExp(`^${escapeRegExp(apiPrefix)}`), '').replace(/^\/+/, '');
      const segments = relPath.split('/').filter(Boolean).map((s) => s.replace(/[{}]/g, ''));
      // 嵌套域（后端为子路由）取前两段，其余扁平域取第一段；路径参数段不计入 feature
      const NESTED_DOMAINS = ['sys', 'logs', 'monitors', 'code-generation', 'oauth2'];
      const feature =
        NESTED_DOMAINS.includes(segments[0]) && segments.length > 1
          ? `${segments[0]}-${segments[1]}`
          : segments[0] || 'misc';
      const fnName = camelCase(op.operationId.split('_api_v1_')[0] || op.operationId);

      const pathParams = (op.parameters || [])
        .filter((p) => p.in === 'path')
        .map((p) => ({ name: p.name, required: true, type: 'string | number' }));
      const queryParams = (op.parameters || [])
        .filter((p) => p.in === 'query')
        .map((p) => ({ name: p.name, required: Boolean(p.required), type: mapSchema(p.schema || {}) }));

      let body = null;
      let multipart = null;
      const requestBody = op.requestBody?.content;
      if (requestBody) {
        if (requestBody['application/json']) {
          const schema = requestBody['application/json'].schema || {};
          if (schema.$ref) {
            const refName = schema.$ref.split('/').pop();
            // Body_* 是 FastAPI 为表单/内联参数生成的临时 schema，直接内联成类型
            body = refName.startsWith('Body_')
              ? { ref: null, inline: spec.components?.schemas?.[refName] }
              : { ref: refName, inline: null };
          } else {
            body = { ref: null, inline: schema };
          }
        } else if (requestBody['multipart/form-data']) {
          let schema = requestBody['multipart/form-data'].schema || {};
          if (schema.$ref) schema = spec.components?.schemas?.[schema.$ref.split('/').pop()] || {};
          const required = new Set(schema.required || []);
          multipart = Object.entries(schema.properties || {})
            .map(([name, prop]) => ({ name, required: required.has(name), type: mapSchema(prop) }));
        }
      }

      const responseSchema = op.responses?.['200']?.content?.['application/json']?.schema || {};
      const returnType = responseSchema.$ref ? unwrapResponse(responseSchema.$ref) : 'unknown';

      ops.push({
        path: pathKey,
        method,
        feature,
        fnName,
        pathParams,
        queryParams,
        body,
        multipart,
        returnType,
        summary: op.summary || '',
      });
    }
  }
  ops.sort((a, b) => (a.feature === b.feature ? a.fnName.localeCompare(b.fnName) : a.feature.localeCompare(b.feature)));
  return ops;
}

// ---------------------------------------------------------------------------
// 生成 types.ts
// ---------------------------------------------------------------------------

function generateTypes(spec, { parseTypeName }) {
  const schemas = spec.components?.schemas || {};
  const lines = [
    HEADER,
    'export type ApiResponse<T = unknown> = {',
    '  code: number;',
    '  msg: string;',
    '  data: T;',
    '};',
    '',
    'export type PageData<T> = {',
    '  items: T[];',
    '  total: number;',
    '  page: number;',
    '  size: number;',
    '  total_pages: number;',
    '  links?: Links;',
    '};',
    '',
    'export type ResponseModel = ApiResponse<unknown>;',
    '',
  ];

  const SKIP = /^(ResponseSchemaModel_|PageData_|Body_)/;
  const mapSchema = makeSchemaMapper({ parseTypeName });

  for (const rawName of Object.keys(schemas).sort()) {
    if (SKIP.test(rawName)) continue;
    if (rawName === 'ResponseModel') continue;
    const schema = schemas[rawName];
    // _Links → Links（PageData<T> 中引用）
    const name = sanitizeTypeName(rawName).replace(/^_/, '');

    if (schema.enum) {
      const values = schema.enum.map((v) => (typeof v === 'string' ? `'${v}'` : String(v))).join(' | ');
      lines.push(`export type ${name} = ${values};`, '');
      continue;
    }

    if (schema.type === 'object' && schema.properties) {
      const required = new Set(schema.required || []);
      lines.push(`export interface ${name} {`);
      for (const [prop, propSchema] of Object.entries(schema.properties)) {
        lines.push(`  ${prop}${required.has(prop) ? '' : '?'}: ${mapSchema(propSchema)};`);
      }
      lines.push('}', '');
      continue;
    }

    lines.push(`export type ${name} = ${mapSchema(schema)};`, '');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 生成单个端点模块
// ---------------------------------------------------------------------------

function generateOperationModule(op, { parseTypeName, referencedTypes }) {
  const { method, path: url, feature, fnName, pathParams, queryParams, body, multipart, returnType } = op;
  const mapSchema = makeSchemaMapper({ parseTypeName });
  const isGet = method === 'get';
  const hasPathQuery = pathParams.length > 0 || queryParams.length > 0;
  const hasArgs = hasPathQuery || Boolean(body) || Boolean(multipart);
  const paramType = `${pascalCase(fnName)}Params`;
  const bodyOnly = Boolean(body) && !hasPathQuery && !multipart;
  const destructured = [
    ...pathParams.map((p) => p.name),
    ...(multipart ? multipart.map((f) => f.name) : []),
    ...(body && !multipart ? ['data'] : []),
    ...queryParams.map((p) => p.name),
  ];
  const queryPart = queryParams.length > 0 ? `{ params: { ${queryParams.map((p) => p.name).join(', ')} } }` : null;
  const urlExpr = `\`${url.replace(/\{([^}]+)\}/g, '${$1}')}\``;

  const out = [];
  out.push(HEADER);
  out.push(`/** ${op.summary} */`);

  // ---- 参数类型 ----
  if (multipart) {
    out.push(`export type ${paramType} = {`);
    for (const p of pathParams) out.push(`  ${p.name}: ${p.type};`);
    for (const p of queryParams) out.push(`  ${p.name}${p.required ? '' : '?'}: ${p.type};`);
    for (const field of multipart) {
      out.push(`  ${field.name}${field.required ? '' : '?'}: ${field.type}${field.required ? '' : ' | null'};`);
    }
    out.push('};');
  } else if (hasArgs && !bodyOnly) {
    out.push(`export type ${paramType} = {`);
    for (const p of pathParams) out.push(`  ${p.name}: ${p.type};`);
    for (const p of queryParams) out.push(`  ${p.name}${p.required ? '' : '?'}: ${p.type};`);
    if (body) out.push(`  data: ${parseTypeName(body.ref)};`);
    out.push('};');
  } else if (bodyOnly) {
    if (body.inline) {
      const required = new Set(body.inline.required || []);
      out.push(`export type ${paramType}Data = {`);
      for (const [key, prop] of Object.entries(body.inline.properties || {})) {
        out.push(`  ${key}${required.has(key) ? '' : '?'}: ${mapSchema(prop)};`);
      }
      out.push('};');
    }
  }

  // ---- axios 请求函数 ----
  out.push('');
  if (!hasArgs) {
    out.push(`export const ${fnName} = (): Promise<${returnType}> => {`);
    out.push(`  return api.${method}(${urlExpr}).then((res) => res.data);`);
  } else if (multipart) {
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push('  const formData = new FormData();');
    for (const field of multipart) {
      out.push(
        field.required
          ? `  formData.append('${field.name}', ${field.name});`
          : `  if (${field.name}) formData.append('${field.name}', ${field.name});`,
      );
    }
    out.push(`  return api.${method}(${urlExpr}, formData${queryPart ? `, ${queryPart}` : ''}).then((res) => res.data);`);
  } else if (bodyOnly) {
    const bodyType = body.ref ? parseTypeName(body.ref) : `${paramType}Data`;
    out.push(`export const ${fnName} = (data: ${bodyType}): Promise<${returnType}> => {`);
    if (method === 'delete') {
      // axios delete 的第二个参数是 config，body 需要包成 { data }
      out.push(`  return api.delete(${urlExpr}, { data }).then((res) => res.data);`);
    } else {
      out.push(`  return api.${method}(${urlExpr}, data).then((res) => res.data);`);
    }
  } else if (method === 'get') {
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push(`  return api.get(${urlExpr}${queryPart ? `, ${queryPart}` : ''}).then((res) => res.data);`);
  } else if (method === 'delete') {
    // axios delete 的 config 直接内联对象键：data / params，避免多包一层花括号
    const configParts = [
      body ? 'data' : null,
      queryParams.length > 0
        ? `params: { ${queryParams.map((p) => p.name).join(', ')} }`
        : null,
    ].filter(Boolean);
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push(`  return api.delete(${urlExpr}${configParts.length ? `, { ${configParts.join(', ')} }` : ''}).then((res) => res.data);`);
  } else if (body) {
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push(`  return api.${method}(${urlExpr}, data${queryPart ? `, ${queryPart}` : ''}).then((res) => res.data);`);
  } else if (queryPart) {
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push(`  return api.${method}(${urlExpr}, null, ${queryPart}).then((res) => res.data);`);
  } else {
    out.push(`export const ${fnName} = (params: ${paramType}): Promise<${returnType}> => {`);
    out.push(`  const { ${destructured.join(', ')} } = params;`);
    out.push(`  return api.${method}(${urlExpr}).then((res) => res.data);`);
  }
  out.push('};');

  // ---- React Query hook ----
  out.push('');
  const queryOptionsCall = hasArgs ? `${fnName}QueryOptions(params)` : `${fnName}QueryOptions()`;
  if (isGet) {
    out.push(`export const ${fnName}QueryOptions = (${hasArgs ? `params: ${paramType}` : ''}) => {`);
    out.push('  return queryOptions({');
    out.push(`    queryKey: ['${feature}', '${kebabCase(fnName)}'${hasArgs ? ', params' : ''}],`);
    out.push(`    queryFn: () => ${fnName}(${hasArgs ? 'params' : ''}),`);
    out.push('  });');
    out.push('};');
    out.push('');
    out.push(`type Use${pascalCase(fnName)}Options = {`);
    if (hasArgs) out.push(`  params: ${paramType};`);
    out.push(`  queryConfig?: QueryConfig<typeof ${fnName}QueryOptions>;`);
    out.push('};');
    out.push('');
    out.push(`export const use${pascalCase(fnName)} = (${hasArgs ? 'options' : '{ queryConfig }'}: Use${pascalCase(fnName)}Options${hasArgs ? '' : ' = {}'}) => {`);
    if (hasArgs) out.push('  const { params, queryConfig } = options;');
    out.push('  return useQuery({');
    out.push(`    ...${queryOptionsCall},`);
    out.push('    ...queryConfig,');
    out.push('  });');
    out.push('};');
  } else {
    out.push(`type Use${pascalCase(fnName)}Options = {`);
    out.push(`  mutationConfig?: MutationConfig<typeof ${fnName}>;`);
    out.push('};');
    out.push('');
    out.push(`export const use${pascalCase(fnName)} = ({ mutationConfig }: Use${pascalCase(fnName)}Options = {}) => {`);
    out.push('  return useMutation({');
    out.push(`    mutationFn: ${fnName},`);
    out.push('    ...mutationConfig,');
    out.push('  });');
    out.push('};');
  }

  // ---- imports ----
  const typeImports = referencedTypes(
    returnType,
    body?.ref ? parseTypeName(body.ref) : '',
    body?.inline ? Object.values(body.inline.properties || {}).map((p) => mapSchema(p)).join(' ') : '',
    ...queryParams.map((p) => p.type),
  );
  const imports = [
    isGet ? "import { queryOptions, useQuery } from '@tanstack/react-query';" : "import { useMutation } from '@tanstack/react-query';",
    '',
    "import { api } from '@/lib/api-client';",
    isGet ? "import { QueryConfig } from '@/lib/react-query';" : "import { MutationConfig } from '@/lib/react-query';",
  ];
  if (typeImports.length) imports.push(`import { ${typeImports.join(', ')} } from '../types';`);

  return [...imports, '', ...out].join('\n');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const spec = await loadSpec(args.spec);
  const schemaNames = Object.keys(spec.components?.schemas || {});
  const { parseTypeName, unwrapResponse, referencedTypes } = makeTypeParser(schemaNames);
  const mapSchema = makeSchemaMapper({ parseTypeName });

  const ops = collectOperations(spec, args.apiPrefix, { unwrapResponse, mapSchema });

  const byFeature = new Map();
  for (const op of ops) {
    if (!byFeature.has(op.feature)) byFeature.set(op.feature, []);
    byFeature.get(op.feature).push(op);
  }

  const outRoot = args.out;
  // 输出目录完全由生成器接管：先清空再写入，避免旧端点残留
  fs.rmSync(outRoot, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  fs.writeFileSync(path.join(outRoot, 'types.ts'), generateTypes(spec, { parseTypeName }));

  let fileCount = 0;
  for (const [feature, featureOps] of byFeature) {
    const dir = path.join(outRoot, feature);
    fs.mkdirSync(dir, { recursive: true });
    for (const op of featureOps) {
      const fileName = `${kebabCase(op.fnName)}.ts`;
      fs.writeFileSync(path.join(dir, fileName), generateOperationModule(op, { parseTypeName, referencedTypes }));
      fileCount += 1;
    }
  }

  fs.writeFileSync(
    path.join(outRoot, 'README.md'),
    `# Generated API code\n\n> This directory is **auto-generated** from the backend OpenAPI document. Do not edit by hand.\n\n- Source: \`${args.spec}\`\n- Regenerate: \`pnpm generate:api\` (optionally \`--spec <path|url>\` / \`--out <dir>\`)\n- \`types.ts\`: backend schemas + \`ApiResponse<T>\` / \`PageData<T>\` generics\n- Each operation module exports: typed request fn + React Query hook\n`,
  );

  console.log(`Generated ${fileCount} operation modules + types.ts from ${args.spec}`);
  console.log(`Output: ${outRoot}`);
  console.log(`Features: ${byFeature.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
