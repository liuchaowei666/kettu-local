# kettu-local

这个仓库保存"带本地改动的 Kettu"，分两部分：

| 分支 | 内容 | 用途 |
| --- | --- | --- |
| `main` | `overlay/`（我们改过的源码文件）、`patches/`、CI 工作流、版本记录 | 自动构建用，体积小 |
| `source` | 完整的 Kettu 0.1.12 源码 + 我们的改动 | 阅读代码、对比上游、回滚参考 |

## 本地改动

1. **DeepSeek 走 Magpie 路由组**：模型菜单里有 `DeepSeek (Magpie)`，provider 由 `local-models.json` 驱动。
2. **余额显示**：用量页余额卡（动画、低余额变色、两周折线），输入框右下角余额胶囊。
3. **自定义 API 配置化**：`%APPDATA%\Kettu\local-models.json` 一处管理 provider 与模型，每个会话生成 `providers.patch.yml` 传给 harness。
4. **更新器读本仓库**：不再检查官方 Releases，避免被官方包覆盖。
5. **技能路径修正**：`SKILL.md` 同时放在技能文件夹与它的上一层。

## 自动构建

`build-on-upstream-release` 工作流每 15 分钟检查 [KettuAI/Kettu](https://github.com/KettuAI/Kettu) 的最新 Release：

1. 有新版才继续（否则跳过）；
2. 下载该版本的源码包，把 `overlay/` 覆盖上去；
3. 编译、打包 Windows 安装包并发布到本仓库 Releases；
4. 若上游改动了被 overlay 覆盖的文件，会开 issue 提醒人工合并。

安装包下载走 ghproxy 镜像，应用内更新提示来自本仓库的 Releases。
