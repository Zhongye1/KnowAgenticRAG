"""
统一测试：验证本地后端 + Docker MySQL 互通
测试项：
  1. 直连 Docker MySQL，数据库可访问
  2. 账号 13425121993@163.com 可查到
  3. 密码验证正确（user_login 返回 True）
  4. authenticate_user 能生成 JWT token
  5. Docker API 登录接口（/api/login/json）200 + token
"""
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "RagBackend"))
os.chdir(os.path.join(os.path.dirname(__file__), "RagBackend"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "RagBackend", ".env"))

print("=" * 55)
print("TEST 1: Direct Docker MySQL connection")
print("=" * 55)
import pymysql
try:
    conn = pymysql.connect(
        host=os.getenv("DB_HOST","127.0.0.1"),
        port=int(os.getenv("DB_PORT",3306)),
        user=os.getenv("DB_USER","root"),
        password=os.getenv("DB_PASSWORD",""),
        database=os.getenv("DB_NAME","rag_user_db"),
        charset="utf8mb4"
    )
    cur = conn.cursor()
    cur.execute("SELECT id, email FROM user ORDER BY id")
    rows = cur.fetchall()
    print(f"  [PASS] Connected. Users in DB: {len(rows)}")
    for r in rows:
        print(f"         id={r[0]}  email={r[1]}")
    conn.close()
except Exception as e:
    print(f"  [FAIL] {e}")
    sys.exit(1)

print()
print("=" * 55)
print("TEST 2: user_login function (password verify)")
print("=" * 55)
try:
    from RAGF_User_Management.LogonAndLogin import user_login
    result = user_login("13425121993@163.com", "GZl165147")
    if result:
        print("  [PASS] user_login('13425121993@163.com', 'GZl165147') = True")
    else:
        print("  [FAIL] user_login returned False")
        sys.exit(1)
except Exception as e:
    print(f"  [FAIL] {e}")
    sys.exit(1)

print()
print("=" * 55)
print("TEST 3: authenticate_user (JWT token generation)")
print("=" * 55)
try:
    from RAGF_User_Management.LogonAndLogin import authenticate_user
    token = authenticate_user("13425121993@163.com")
    if token and len(token) > 20:
        print(f"  [PASS] JWT token generated: {token[:30]}...")
    else:
        print(f"  [FAIL] token invalid: {token}")
        sys.exit(1)
except Exception as e:
    print(f"  [FAIL] {e}")
    sys.exit(1)

print()
print("=" * 55)
print("TEST 4: Docker API /api/login/json (HTTP)")
print("=" * 55)
import urllib.request, json
try:
    body = json.dumps({"email": "13425121993@163.com", "password": "GZl165147"}).encode()
    req = urllib.request.Request(
        "http://localhost:8000/api/login/json",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())
        if data.get("status") == "success" and data.get("token"):
            print(f"  [PASS] API login OK. token: {data['token'][:30]}...")
        else:
            print(f"  [FAIL] Unexpected response: {data}")
            sys.exit(1)
except Exception as e:
    print(f"  [FAIL] {e}")
    sys.exit(1)

print()
print("=" * 55)
print("TEST 5: Docker API /api/login/json with wrong password")
print("=" * 55)
import urllib.error
try:
    body = json.dumps({"email": "13425121993@163.com", "password": "wrongpassword"}).encode()
    req = urllib.request.Request(
        "http://localhost:8000/api/login/json",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode())
        print(f"  [FAIL] Should have rejected wrong password, got: {data}")
        sys.exit(1)
except urllib.error.HTTPError as e:
    if e.code == 401:
        print(f"  [PASS] Correctly rejected wrong password (401)")
    else:
        print(f"  [FAIL] Unexpected HTTP {e.code}")
        sys.exit(1)
except Exception as e:
    print(f"  [FAIL] {e}")
    sys.exit(1)

print()
print("=" * 55)
print("ALL TESTS PASSED")
print("Both local dev and Docker use the same MySQL: ragf-mysql")
print("=" * 55)
