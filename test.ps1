# 找到electron的完整路径
# 通常在 node_modules\.bin\electron.cmd
for ($i=1; $i -le 5; $i++) {
    Start-Process ".\node_modules\.bin\electron.cmd" -ArgumentList "." -WindowStyle Normal
}