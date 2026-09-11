from dataclasses import dataclass

ERRORS = {
    "MODEL_NOT_CONFIGURED": (409, "请先在模型设置中保存自己的模型 API Key。", False),
    "MODEL_CONFIG_CHANGED": (409, "模型设置已变化，请刷新页面并核对提供商后重试。", False),
    "MODEL_KEY_REQUIRED": (422, "首次配置或更换提供商地址、接口格式时，请填写对应的 API Key。", False),
    "MODEL_KEY_INVALID": (422, "模型 API Key 无效或没有访问权限，请检查提供商设置。", False),
    "MODEL_RATE_LIMITED": (429, "模型提供商限制了请求或账户额度不足，请检查余额后重试。", True),
    "MODEL_ENDPOINT_DENIED": (422, "模型地址必须使用可访问的公网 HTTPS 服务。", False),
    "PDF_INVALID": (422, "文件不是可读取的 PDF，请重新导出后上传。", False),
    "PDF_ENCRYPTED": (422, "PDF 已加密，请先解除密码保护后重新上传。", False),
    "PDF_PAGE_LIMIT": (422, "PDF 必须包含 1 到 30 页。", False),
    "PDF_COMPLEX": (422, "PDF 过于复杂，无法在资源限制内解析，请重新导出。", False),
    "PDF_TEXT_LIMIT": (422, "PDF 文字超过 50000 字符，请仅保留简历内容。", False),
    "PDF_NO_TEXT": (
        422,
        "没有提取到文字，可能是扫描件或空白文件；请使用可复制文字的 PDF，或手动创建简历。",
        False,
    ),
    "PDF_MODEL_TEXT_LIMIT": (422, "原文较长，请对照原文手动整理。", False),
    "IMPORT_INTERRUPTED": (409, "解析因服务重启或关闭中断，请重新上传。", True),
    "IMPORT_FAILED": (422, "解析未完成，请重新导出 PDF 或手动创建简历。", True),
    "IMPORT_NOT_READY": (409, "导入尚未完成、已取消或已经确认。", False),
    "PERMISSION_DENIED": (403, "当前账号或密钥没有此操作权限。", False),
    "CSRF_INVALID": (403, "登录状态验证失败，请刷新页面后重试。", False),
    "LOGIN_FAILED": (401, "用户名或密码不正确，或账号已被停用。", False),
    "INVITATION_INVALID": (422, "邀请码无效、已过期或已用完。", False),
    "REGISTRATION_CONFLICT": (409, "该用户名不可用，请换一个用户名。", False),
    "RECOVERY_INVALID": (422, "恢复码无效、已过期或已使用。", False),
    "REVISION_CONFLICT": (409, "资料已在其他页面更新，请重新载入后再保存。", False),
    "RESOURCE_LIMIT": (409, "已达到可创建数量上限，请先整理现有内容。", False),
    "LAST_ADMIN_REQUIRED": (409, "至少需要保留一个可用管理员。", False),
    "PROTOCOL_UNSUPPORTED": (400, "接口版本不支持，请更新客户端。", False),
    "AUTH_REQUIRED": (401, "请提供访问令牌。", False),
    "TOKEN_INVALID": (401, "访问令牌无效或已撤销。", False),
    "ORIGIN_DENIED": (403, "此客户端来源未获允许。", False),
    "REQUEST_NOT_ALLOWED": (403, "请求不符合服务访问配置。", False),
    "NOT_FOUND": (404, "接口不存在。", False),
    "METHOD_NOT_ALLOWED": (405, "请求方法不支持。", False),
    "REQUEST_TIMEOUT": (408, "读取请求超时。", True),
    "PAYLOAD_TOO_LARGE": (413, "请求超过此接口的大小限制；PDF 最大 10 MiB，简历最大 1 MiB。", False),
    "MEDIA_TYPE_UNSUPPORTED": (415, "正文类型不支持，请使用接口指定的未压缩格式。", False),
    "VALIDATION_ERROR": (422, "请求格式不正确，请检查字段、长度和重复标识。", False),
    "SENSITIVE_INPUT_REJECTED": (422, "请先移除联系信息、证件号码和访问凭据。", False),
    "RATE_LIMITED": (429, "请求过于频繁，请稍后重试。", True),
    "QUOTA_EXCEEDED": (429, "今日模型调用额度已用完。", False),
    "SERVER_BUSY": (429, "已有请求处理中，请稍后重试。", True),
    "CLIENT_DISCONNECTED": (499, "客户端已取消本次请求。", False),
    "INTERNAL_ERROR": (500, "服务处理失败，请凭请求编号排查。", False),
    "MODEL_OUTPUT_INVALID": (502, "模型结果未通过校验，请手动处理或重新请求。", True),
    "MODEL_UNAVAILABLE": (503, "模型暂不可用，本地填写仍可使用。", True),
    "MODEL_WARMING_UP": (503, "模型正在加载，请稍后重试；本地填写仍可使用。", True),
    "AUTH_CONFIG_UNAVAILABLE": (503, "认证配置暂不可用。", True),
    "MODEL_TIMEOUT": (504, "生成超时，请稍后重试；本地填写仍可使用。", True),
}


@dataclass
class APIError(Exception):
    code: str

    @property
    def status(self):
        return ERRORS[self.code][0]

    def body(self, request_id: str):
        _, message, retryable = ERRORS[self.code]
        return {
            "request_id": request_id,
            "error": {
                "code": self.code,
                "message": message,
                "retryable": retryable,
            },
        }
