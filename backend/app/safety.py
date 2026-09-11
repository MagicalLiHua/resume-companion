import json
import re
import unicodedata

from .errors import APIError

CONTACT = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\d)(?:\+?86[ -]?)?1[3-9](?:[ -]?\d){9}(?!\d)"
    r"|(?<!\d)\d{17}[\dXx](?!\w)|(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)"
    r"|(?:bearer\s+|sk-)[A-Za-z0-9_\-]{12,}"
    r"|(?:姓名|联系人|身份证|护照号|密码|验证码|令牌|api[_ -]?key)\s*[:：=]\s*[^\s,，;；]{2,}",
    re.IGNORECASE,
)
BLOCKED = re.compile(
    r"密码|验证码|校验码|身份证|证件号|护照|银行卡|信用卡|银行账户|承诺|声明|同意|隐私|协议|授权|调剂"
    r"|最高.*学历|最高.*学位|性别|民族|政治面貌|婚姻|薪资|出生|年龄|紧急联系人|家庭成员"
    r"|password|passcode|one.?time|otp|captcha|passport|credit.?card|bank.?account|consent|agreement",
    re.IGNORECASE,
)
PLACEHOLDER = re.compile(r"\[\[[^\[\]\n]{1,80}\]\]")
NUMBER = re.compile(r"\d+(?:[.,]\d+)*(?:%|％)?")
CLAIM = re.compile(
    r"博士|硕士|教授|总监|经理|主管|负责人|一等奖|二等奖|三等奖|国家级|省级|认证|证书|精通|多年"
)


def normalized_text(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value) if unicodedata.category(c) != "Cf")


def sensitive(value: str) -> bool:
    return bool(CONTACT.search(normalized_text(value)))


def input_texts(request):
    if hasattr(request, "fields"):
        return [text for f in request.fields for text in [f.label, f.group_label, *f.option_labels]]
    return [request.question, *request.job_requirements, *(f.text for f in request.facts)]


def inspect_input(request, max_characters):
    texts = input_texts(request)
    ids = (
        [f.field_id for f in request.fields] if hasattr(request, "fields") else [f.id for f in request.facts]
    )
    if any(sensitive(text) for text in [*texts, *ids]):
        raise APIError("SENSITIVE_INPUT_REJECTED")
    if sum(len(t) for t in texts) > max_characters:
        raise APIError("PAYLOAD_TOO_LARGE")


def parse_json(raw: str | bytes):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(_):
        raise ValueError("Non-finite JSON number")

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=reject_constant)
