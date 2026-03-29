import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

try:
    # Environment variable
    connection = pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", 3306)),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "mysql"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )

    print(">>> 数据库连接成功! <<<")

    with connection.cursor() as cursor:
        cursor.execute("SELECT VERSION() AS version")
        result = cursor.fetchone()
        print(f"MySQL版本: {result['version']}")

        cursor.execute("SELECT @@global.time_zone, @@session.time_zone AS timezone")
        result = cursor.fetchone()
        print(f"服务器时区: {result['timezone']} (应为Asia/Shanghai)")

        # Initialize
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()


except pymysql.Error as e:
    print(f"数据库连接失败: {e}")
