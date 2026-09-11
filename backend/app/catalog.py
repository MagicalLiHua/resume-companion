import re
from dataclasses import dataclass


@dataclass(frozen=True)
class CatalogItem:
    path: str
    label: str
    group: str
    value_type: str
    aliases: tuple[str, ...]


def item(path, label, group, kind, *aliases):
    return CatalogItem(path, label, group, kind, (label, *aliases))


CATALOG = [
    item("basic.full_name", "姓名", "basic", "text", "名字", "真实姓名", "name", "full name"),
    item("basic.email", "邮箱", "basic", "text", "电子邮件", "电子邮箱", "email"),
    item("basic.phone", "手机号", "basic", "text", "联系电话", "手机号码", "phone", "mobile"),
    item("basic.city", "现居城市", "basic", "text", "现居住地", "city"),
    item("basic.job_intention", "求职意向", "basic", "text", "期望职位", "应聘岗位"),
    item("education[].school", "学校", "education", "text", "毕业院校", "学校名称", "school"),
    item("education[].major", "专业", "education", "text", "所学专业", "major"),
    item("education[].education_level", "学历层次", "education", "enum", "学历", "就读学历"),
    item("education[].degree", "所获学位", "education", "enum", "学位", "已获学位", "degree"),
    item("education[].expected_degree", "预计学位", "education", "enum", "拟获学位"),
    item("education[].study_mode", "学习形式", "education", "enum", "学习方式", "培养方式"),
    item("education[].start_month", "入学时间", "education", "month", "入学年月", "开始时间"),
    item("education[].end_month", "毕业时间", "education", "month", "毕业年月", "结束时间"),
    item("experience[].organization", "单位", "experience", "text", "公司", "实习单位", "公司名称"),
    item("experience[].role", "职位", "experience", "text", "职务", "担任职务", "岗位"),
    item("experience[].start_month", "开始时间", "experience", "month", "入职时间"),
    item("experience[].end_month", "结束时间", "experience", "month", "离职时间"),
    item("experience[].facts", "工作内容", "experience", "text", "工作描述", "主要职责", "实习内容"),
    item("projects[].name", "项目名称", "project", "text", "项目名"),
    item("projects[].role", "项目角色", "project", "text", "担任角色", "角色"),
    item("projects[].start_month", "开始时间", "project", "month", "项目开始时间"),
    item("projects[].end_month", "结束时间", "project", "month", "项目结束时间"),
    item("projects[].technologies", "技术栈", "project", "list", "使用技术", "技术工具"),
    item("projects[].facts", "项目描述", "project", "text", "项目内容", "项目职责"),
    item("skills", "专业技能", "skills", "list", "技能", "技能特长", "skills"),
]
CATALOG_BY_PATH = {entry.path: entry for entry in CATALOG}


def normalize_label(value):
    return re.sub(r"[\s:：*()（）_-]", "", value).lower()


ALIASES_BY_GROUP = {}
for entry in CATALOG:
    for alias in entry.aliases:
        ALIASES_BY_GROUP.setdefault((entry.group, normalize_label(alias)), set()).add(entry.path)


def known_source(field, available):
    paths = ALIASES_BY_GROUP.get((field.group, normalize_label(field.label)), set())
    if len(paths) != 1:
        return None
    path = next(iter(paths))
    return path if path in available and compatible(field, path) else None


def ambiguous_without_group(field):
    if field.group != "other":
        return False
    label = normalize_label(field.label)
    paths = {path for (_, alias), entries in ALIASES_BY_GROUP.items() if alias == label for path in entries}
    return len(paths) > 1 or label in {"名称", "信息", "内容", "角色", "其他", "备注"}


def compatible(field, path: str) -> bool:
    source = CATALOG_BY_PATH.get(path)
    if not source or field.group not in {"other", source.group}:
        return False
    known = ALIASES_BY_GROUP.get((field.group, normalize_label(field.label)), set())
    if len(known) == 1 and path not in known:
        return False
    if field.input_kind == "checkbox":
        return path == "skills" and field.group == "skills"
    if field.input_kind == "email":
        return path == "basic.email"
    if field.input_kind == "tel":
        return path == "basic.phone"
    if field.input_kind in {"date", "month"}:
        return source.value_type == "month"
    return True
