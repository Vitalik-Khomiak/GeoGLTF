# GeoGLTF — локальний сервер для запуску застосунку.
# Запускається через start.bat (подвійний клік).

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$port = 8000
$url  = "http://localhost:$port"
$root = Split-Path -Parent $PSScriptRoot   # папка GeoGLTF

$Host.UI.RawUI.WindowTitle = "GeoGLTF — локальний сервер"

# --- чи сервер уже працює? ---
$busy = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
    Write-Host ""
    Write-Host "  Сервер на порту $port вже працює — відкриваю браузер." -ForegroundColor Yellow
    Write-Host ""
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
}

# --- пошук Python ---
$py = $null
foreach ($name in 'python', 'py') {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { $py = $cmd.Source; break }
}

if (-not $py) {
    Write-Host ""
    Write-Host "  Python не знайдено." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Встановіть Python з https://www.python.org/downloads/"
    Write-Host '  і під час встановлення поставте галочку "Add Python to PATH".'
    Write-Host ""
    exit 1
}

# --- браузер відкриється, коли сервер підніметься ---
Start-Job -ScriptBlock {
    param($u)
    Start-Sleep -Seconds 2
    Start-Process $u
} -ArgumentList $url | Out-Null

Write-Host ""
Write-Host "  GeoGLTF працює на $url" -ForegroundColor Green
Write-Host ""
Write-Host "  Браузер відкриється автоматично."
Write-Host "  Щоб зупинити сервер — закрийте це вікно або натисніть Ctrl+C."
Write-Host ""

Set-Location $root
& $py -m http.server $port --bind 127.0.0.1
