import os

# 目标大小：1MB
target_size = 1000 * 1024 * 1024  

# 文件路径
file_path_1mb = "./test.txt"

# 生成内容
with open(file_path_1mb, "w", encoding="utf-8") as f:
    chunk = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n" * 100
    while f.tell() < target_size:
        f.write(chunk)

# 最终文件大小
actual_size = os.path.getsize(file_path_1mb)
actual_size_MB = actual_size / (1024 * 1024)
actual_size_MB
