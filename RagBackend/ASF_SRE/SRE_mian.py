import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

try:
    # 连接配置（从环境变量读取，避免硬编码）
    connection = pymysql.connect(
        host=os.getenv('DB_HOST', '127.0.0.1'),
        port=int(os.getenv('DB_PORT', 3306)),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'mysql'),
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )
    
    print(">>> 数据库连接成功! <<<")
    
    # 测试查询
    with connection.cursor() as cursor:
        # 查询当前数据库版本
        cursor.execute("SELECT VERSION() AS version")
        result = cursor.fetchone()
        print(f"MySQL版本: {result['version']}")
        
        # 验证时区配置
        cursor.execute("SELECT @@global.time_zone, @@session.time_zone AS timezone")
        result = cursor.fetchone()
        print(f"服务器时区: {result['timezone']} (应为Asia/Shanghai)")
        
        # 验证初始化数据库
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
      
    
except pymysql.Error as e:
    print(f"数据库连接失败: {e}")