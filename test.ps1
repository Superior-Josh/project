for ($i=1; $i -le 2; $i++) {
    Start-Process ".\node_modules\.bin\electron.cmd" -ArgumentList "." -WindowStyle Normal
}