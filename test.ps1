for ($i=1; $i -le 5; $i++) {
    Start-Process ".\node_modules\.bin\electron.cmd" -ArgumentList "." -WindowStyle Normal
}