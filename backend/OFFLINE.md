# 安装、升级与恢复（0.4.0）

离线包面向 Linux/amd64，包含源码、编译网页、Python 基础镜像与全部生产 wheel，不含凭证、简历、数据库或模型。默认只需要 Docker Compose，不需要 GPU、Ollama 或本地模型。安装可离线进行；调用外部模型 API 时服务器需要联网。

## 新安装

核对整包 `.sha256` 后解压，进入 `resume-companion-backend-0.4.0/backend`，核对包内 `MANIFEST.sha256.json`。导入基础镜像，复制环境示例，按当前用户修改 `API_UID/API_GID`：

```sh
docker load -i python-3.12-linux-amd64.tar.gz
cp deploy.env.example .env
id -u
id -g
mkdir -m 700 .runtime .data
docker compose -f compose.yaml -f compose.offline.yaml build api
./scripts/server-admin.sh init --mode private_model
./scripts/server-admin.sh enable-web --data-directory /data --web-directory /app/web --web-origin http://127.0.0.1:18080 --extension-id 本包extension-id.txt中的ID
./scripts/server-admin.sh enable-personal-models
```

`init` 拒绝覆盖现有配置。`enable-personal-models` 创建权限 600 的 `providers.key`，重复执行会保留原密钥。构建使用锁定摘要的本地 wheel，不会下载依赖。

以 `.env` 中所设 UID/GID 初始化管理员（替换示例数字）：

```sh
docker run --rm --network none --user 10001:10001 -v "$PWD/.runtime:/run/resume:rw" -v "$PWD/.data:/data:rw" resume-companion-api:0.4.0 python -m app.account_admin --config /run/resume/config.json bootstrap --username administrator --password-output /run/resume/web-admin-password.txt
docker compose -f compose.yaml -f compose.offline.yaml up -d --no-build --pull never api
```

管理员密码只写入指定私有文件，不回显。通过 SSH 私密取回后移除服务器上的明文副本。已有管理员不需再次初始化；紧急恢复使用 `app.account_admin reset-password`，会撤销旧会话与插件 Key。

## 使用入口

默认仅监听服务器回环地址。使用者电脑建立并保持 SSH 通道：

```sh
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:18080:127.0.0.1:18080 user2@10.160.108.2
```

打开 `http://127.0.0.1:18080`，普通用户可直接注册，无需邀请码。用户在“模型设置”保存自己的提供商 Key；无需将任何共享 DeepSeek Key 配置到服务环境。手动维护和插件填写不需要模型。

多人内网或域名入口另行配置 HTTPS、`web_origin` 和明确的 `allowed_hosts/allowed_origins`。默认回环入口不会直接暴露给整个内网。

## 升级与回退

先保留旧镜像 ID、`.runtime` 私有副本，用旧版 `app.backup create` 取得一致备份，并在全新目录完成恢复验证。新镜像构建和真实 API 验证成功后，替换应用、网页及 Compose；保留 `.data`。

从 0.3.x 升级时用新镜像执行 `enable-personal-models`，再只重建 API。0.4.0 数据迁移新增个人模型表和导入记录的提供商字段；旧邀请记录保留，但邀请 API 与界面移除。已有账号、密码、正式简历和插件 Key 不变。

```sh
./scripts/server-admin.sh enable-personal-models
docker compose -f compose.yaml -f compose.offline.yaml up -d --no-deps --no-build --pull never api
```

回退保留现有 `.data`，恢复旧镜像和升级前配置；保留 `providers.key`，避免以后重新升级丢失解密能力。不要用旧数据库覆盖运行中的新数据。迁移后的数据库不能直接用旧版恢复器当成旧备份处理，应使用对应版本工具。

备份与恢复命令见 [后端说明](README.md)。0.4.0 备份包含模型加密主密钥；备份与发布包必须分开存放。

## 可选本地模型

只有明确选择服务器推理时，才设置 `model_provider: "ollama"` 和 Ollama 连接参数，并使用 `-f compose.local-model.yaml --profile local-model`。这时需另备 GPU 环境、Ollama 镜像和权重；不要直接使用示例中的历史镜像摘要。默认个人 API 模式无需这些依赖，也不会停止其他项目的模型服务。

## 在有网电脑更新依赖

```sh
cd backend
uv lock
uv export --frozen --no-dev --no-emit-project --output-file requirements.lock
cd ..
python3 -m pip download --require-hashes --only-binary=:all: --platform manylinux2014_x86_64 --platform manylinux_2_28_x86_64 --implementation cp --python-version 3.12 --abi cp312 --dest artifacts/backend-offline/wheelhouse -r backend/requirements.lock
npm run web:build
backend/.venv/bin/python backend/scripts/package_backend.py
```

Python 基础镜像已有相同摘要时无需再次导入。网页随包发布，服务器无需 npm；离线包不包含 Node 开发依赖。
