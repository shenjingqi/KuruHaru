# Harness Engineering T0 改进

> 状态: ✅ 已完成  
> 创建时间: 2026-02-27  
> 完成时间: 2026-02-27

## 目标

提升项目架构质量，完成 Harness Engineering T0 级别改进任务。

## 任务列表

- [x] T0-1: 引入测试框架 (Vitest) 并编写 Utils 层单元测试
- [x] T0-2: 完善 httpClient interceptors (请求/响应拦截器)
- [x] T0-3: 统一错误处理 (统一使用 errorHandler)
- [x] 更新 docs/quality/README.md 评分和状态

## 完成内容

### T0-1: 单元测试覆盖

- 引入 Vitest 测试框架
- 为 errorHandler.js 编写 14 个单元测试
- 为 retry.js 编写 6 个单元测试
- 新增命令: `npm test`

### T0-2: httpClient interceptors

- 添加请求拦截器（统一添加 headers）
- 添加响应拦截器（统一错误处理，使用 normalizeError）
- 添加代理自动切换逻辑
- 新增 getTgClient() 函数

### T0-3: 错误处理统一

- httpClient.js 已集成 normalizeError
- asmr-login.js 已使用 normalizeError

## 分数变化

| 模块          | 改进前 | 改进后 |
| ------------- | ------ | ------ |
| 测试覆盖      | 40     | 75     |
| httpClient.js | 68     | 80     |
| 错误处理      | 65     | 78     |

## 决策日志

### 2026-02-27

- [决定]: 使用 Vitest 而非 Jest - 原因: Vitest 与 Vite 集成更好，配置更简单
- [决定]: 拦截器中集成 normalizeError - 原因: 统一错误处理，减少重复代码
- [决定]: 支持代理自动切换 - 原因: 提高网络请求稳定性
