# 说明书 API 目录执行任务

## 执行规则

- 每项任务只交付一个可独立验证的结果。
- 先写失败测试并确认失败原因，再写实现。
- 完成后记录实际验证命令和结果。
- 每次提交只包含当前任务文件。
- 实施使用 `superpowers:executing-plans`；本事项不拆分给子代理。

## 任务

- [x] 建立机器目录和纯领域安全规则
  - 依赖：无。
  - 文件：`docs/platform/api-registry.json`、`src/domain/apiCatalog.js`、`tests/api-registry.test.mjs`、`react-tests/api-catalog.test.mjs`。
  - 输入：现有 `docs/platform/api-catalog.md`、`docs/platform/apis/*.md`、当前路由和契约测试。
  - 输出：`validateApiRegistry`、`filterApiEndpoints`、`buildApiLiveUrl`、`sanitizeApiPreview`。
  - 失败测试：

    ```js
    assert.throws(
      () => validateApiRegistry({
        version: 1,
        apps: [{ id: "company-platform", label: "公司平台", order: 10 }],
        endpoints: [{
          id: "unsafe-write",
          appId: "company-platform",
          method: "POST",
          path: "/api/state",
          liveTest: { enabled: true, query: [], defaults: {}, timeoutMs: 15000 }
        }]
      }),
      error => error.code === "API_LIVE_TEST_FORBIDDEN"
    );
    assert.deepEqual(
      sanitizeApiPreview({ token: "secret", rows: Array.from({ length: 25 }, (_, id) => ({ id })) }),
      {
        body: { token: "[已遮罩]", rows: Array.from({ length: 20 }, (_, id) => ({ id })) },
        truncated: true
      }
    );
    ```

  - 运行红灯：`node --test tests/api-registry.test.mjs react-tests/api-catalog.test.mjs`；预期因模块或函数不存在失败。
  - 实现步骤：
    1. 从正式契约提取首批 App 和接口，逐项记录 `source`、状态和安全示例。
    2. 校验 `version`、App、稳定 ID、方法、路径、契约路径、示例和实测配置。
    3. 只允许根相对 `/api/` 路径和显式查询白名单。
    4. 递归遮罩敏感键，数组裁剪至 20 项，序列化结果裁剪至 100 KiB。
  - 验证：同一测试命令通过，且 `rg -ni '"[^"]*(password|token|cookie|authorization|secret)[^"]*"\\s*:\\s*"[^[]' docs/platform/api-registry.json` 不输出明文示例。
  - 提交：`feat(handbook): 建立 API 机器目录`。

- [x] 增加 API 顶部分类与契约文档加载
  - 依赖：机器目录和领域安全规则。
  - 文件：`src/domain/handbook.js`、`src/features/handbook/handbookCatalog.js`、`react-tests/handbook.test.mjs`。
  - 输入：`docs/platform/api-registry.json`、`docs/platform/apis/*.md`。
  - 输出：`HANDBOOK_CATEGORIES` 中的 `api` 分类、`api/<file-name>` 文档 slug、已校验 `apiRegistry` 导出。
  - 失败测试：

    ```js
    assert.deepEqual(HANDBOOK_CATEGORIES.map(item => item.label), [
      "使用手册",
      "产品与设计",
      "平台能力",
      "API 目录"
    ]);
    assert.match(catalogSource, /docs\\/platform\\/apis\\/\\*\\.md/);
    assert.match(catalogSource, /category: "api"/);
    ```

  - 运行红灯：`node --test react-tests/handbook.test.mjs`；预期缺少“API 目录”和 API 文档 glob。
  - 实现步骤：
    1. 在 `HANDBOOK_CATEGORIES` 末尾加入 `{ id: "api", label: "API 目录" }`。
    2. 将 `docs/platform/apis/*.md` 映射为 `api` 分类与 `api/<name>` slug。
    3. 更新分类排序和 `KIND_LABELS`，保留现有深链与专题面板。
  - 验证：`node --test react-tests/handbook.test.mjs` 通过。
  - 提交：`feat(handbook): 增加 API 目录分类`。

- [x] 实现 App 分组和静态契约详情
  - 依赖：API 分类与机器目录。
  - 文件：`src/features/handbook/ApiCatalogWorkspace.jsx`、`src/features/handbook/api-catalog.css`、`src/features/handbook/HandbookPage.jsx`、`react-tests/api-catalog.test.mjs`。
  - 输入：已校验 `apiRegistry` 和当前说明书选择回调。
  - 输出：`ApiCatalogWorkspace({ registry, onOpenContract })`。
  - 失败测试：

    ```js
    assert.match(workspaceSource, /公司平台/);
    assert.match(workspaceSource, /产品全周期/);
    assert.match(workspaceSource, /供应链/);
    assert.match(workspaceSource, /Input/);
    assert.match(workspaceSource, /Output/);
    assert.match(workspaceSource, /说明书不会执行写请求/);
    assert.doesNotMatch(workspaceSource, /method:\\s*"POST"[\\s\\S]*fetch\\(/);
    ```

  - 运行红灯：`node --test react-tests/api-catalog.test.mjs`；预期 `ApiCatalogWorkspace.jsx` 不存在。
  - 实现步骤：
    1. 创建 App、方法、状态和关键词筛选。
    2. 使用按钮列表展示方法、路径、标题、状态和权限摘要。
    3. 按固定章节渲染 Input、请求、Output、成功响应、错误和契约来源。
    4. 为所有代码块提供可访问的复制按钮和复制成功反馈。
    5. 在 `HandbookPage` 的 `api` 分类挂载专用工作区，不渲染通用三栏正文。
    6. 添加桌面双栏、平板收窄和 390 px 单列样式。
  - 验证：`node --test react-tests/handbook.test.mjs react-tests/api-catalog.test.mjs` 通过。
  - 提交：`feat(handbook): 展示分 App API 契约`。

- [x] 接入安全只读 GET 实测
  - 依赖：App 分组和静态契约详情。
  - 文件：`src/state/apiCatalogApi.js`、`src/features/handbook/ApiCatalogWorkspace.jsx`、`src/domain/apiCatalog.js`、`react-tests/api-catalog.test.mjs`。
  - 输入：登记项 `liveTest`、允许查询参数、当前同源 `fetch`。
  - 输出：`runApiLiveTest({ endpoint, params, fetchImpl, now, timeoutMs })`。
  - 失败测试：

    ```js
    const result = await runApiLiveTest({
      endpoint: readableEndpoint,
      params: { page: 1, ignored: "drop-me" },
      fetchImpl: async (url, options) => {
        assert.equal(url, "/api/platform/v1/product-catalog?page=1");
        assert.equal(options.method, "GET");
        assert.equal(options.credentials, "same-origin");
        return new Response(JSON.stringify({
          requestId: "req-1",
          token: "must-hide",
          data: { items: [] }
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
      now: () => new Date("2026-07-30T08:00:00.000Z")
    });
    assert.equal(result.requestId, "req-1");
    assert.equal(result.body.token, "[已遮罩]");
    await assert.rejects(
      runApiLiveTest({ endpoint: writeEndpoint, params: {}, fetchImpl: async () => new Response() }),
      error => error.code === "API_LIVE_TEST_FORBIDDEN"
    );
    ```

  - 运行红灯：`node --test react-tests/api-catalog.test.mjs`；预期 `runApiLiveTest` 不存在。
  - 实现步骤：
    1. 从领域函数生成固定相对 URL，只保留白名单查询字段。
    2. 使用 `credentials: "same-origin"` 和 `AbortController`；不添加自定义认证 Header。
    3. 读取 JSON 或限量文本，提取 `requestId` 和数据环境后调用 `sanitizeApiPreview`。
    4. UI 增加参数输入、运行、403、超时、网络失败、成功和截断状态。
    5. 仅对 `GET + liveTest.enabled` 渲染按钮；写接口始终只显示示例。
  - 验证：`node --test react-tests/api-catalog.test.mjs` 通过。
  - 提交：`feat(handbook): 支持安全只读 API 实测`。

- [x] 写回目录规则并完成全量验收
  - 依赖：安全只读实测。
  - 文件：`docs/platform/api-catalog.md`、证据不足时需要修正的 `docs/platform/apis/*.md`、`docs/features/handbook-api-catalog/tasks.md`。
  - 输入：机器目录、正式契约、实现后的页面状态。
  - 输出：按 App 的人工概览、规范化接口说明、完整验证证据。
  - 失败测试：

    ```js
    for (const endpoint of registry.endpoints) {
      assert.ok(appIds.has(endpoint.appId));
      assert.ok(await fileExists(endpoint.contract));
      assert.ok(endpoint.examples.request);
      assert.ok(endpoint.examples.success);
    }
    ```

  - 运行红灯：`node --test tests/api-registry.test.mjs`；预期未补齐的真实契约或示例被明确列出。
  - 实现步骤：
    1. 将 `docs/platform/api-catalog.md` 改为七个 App 的接口概览和目录使用说明。
    2. 只修正文档与真实路由不一致的契约，不改变路由行为。
    3. 在 `1440 × 900`、`1024 × 768`、`390 × 844` 验收筛选、复制、403、超时、截断和写接口禁用。
    4. 使用本地线上模式实测登记的安全 `GET`，记录状态和 `requestId`，不保存响应明细。
    5. 运行完整门禁和 Pages Functions 兼容构建。
  - 验证：

    ```bash
    npm run lint
    npm run check:governance
    npm run check:integrations
    npm run check:environment-capabilities
    npm test
    npm run build
    npx wrangler pages functions build
    ```

  - 提交：`docs(platform): 按 App 固化 API 目录规则`。
