import re
import time

from pypinyin import Style, lazy_pinyin


def to_pinyin(text: str) -> str:
    return "".join(lazy_pinyin(text, style=Style.NORMAL))


def validate_username(username: str) -> tuple[bool, str]:
    if not username:
        return False, "用户名不能为空"
    if len(username) < 2:
        return False, "用户名长度不能少于2个字符"
    if len(username) > 20:
        return False, "用户名长度不能超过20个字符"
    if not re.match(r"^[一-龥a-zA-Z0-9_]+$", username):
        return False, "用户名只能包含中文、英文、数字和下划线"
    return True, ""


def validate_uid(uid: str) -> tuple[bool, str]:
    """登录标识的格式规则：3–20 位字母、数字与下划线。

    自助注册是公开端点，这条规则必须在服务端成立。用 `fullmatch` 而不是 `^…$`：`$` 也匹配
    结尾换行，`"admin\\n"` 会通过校验并以 `admin` 的样子出现在用户列表里。判定顺序与
    `/auth/initialize` 的内联版本一致（先字符集、后长度），两处的文案也保持同一份。
    """
    if not re.fullmatch(r"[a-zA-Z0-9_]+", uid or ""):
        return False, "用户ID只能包含字母、数字和下划线"
    if len(uid) < 3 or len(uid) > 20:
        return False, "用户ID长度必须在3-20个字符之间"
    return True, ""


def generate_uid(username: str) -> str:
    uid = re.sub(r"[^a-zA-Z0-9_]", "", to_pinyin(username.strip()))
    if uid and uid[0].isdigit():
        uid = f"u{uid}"
    if len(uid) < 2:
        uid = f"user{hash(username) % 10000:04d}"
    return uid[:20].lower()


def generate_unique_uid(username: str, existing_uids: list[str]) -> str:
    base_uid = generate_uid(username)
    if base_uid not in existing_uids:
        return base_uid

    counter = 1
    while counter <= 9999:
        candidate = f"{base_uid}{counter}"
        if candidate not in existing_uids:
            return candidate
        counter += 1

    return f"{base_uid}{int(time.time()) % 10000}"


def is_valid_phone_number(phone: str) -> bool:
    if not phone:
        return False
    return bool(re.match(r"^1[3-9]\d{9}$", re.sub(r"[\s\-\(\)]", "", phone)))


def normalize_phone_number(phone: str) -> str:
    if not phone:
        return ""
    phone = re.sub(r"\D", "", phone)
    if len(phone) == 11 and phone.startswith("1"):
        return phone
    return phone
