# DEPRECATED: Skrip ini tidak lagi diperlukan sejak sistem beralih ke Dynamic Per-Voter USB Dongle Lock.
# Dongle kini berupa file dongle-Vxxxxxx.key yang diunduh saat registrasi pemilih dan disimpan ke USB.
# Tidak perlu mendaftarkan USB statis (DONGLE_ID / DONGLE_VOLUME_SERIAL) ke .env.
# Arsipkan atau hapus skrip ini jika tidak dibutuhkan untuk referensi.

param(
  [Parameter(Mandatory=$true)]
  [ValidatePattern('^[A-Za-z]$')]
  [string]$DriveLetter
)
$ErrorActionPreference = 'Stop'
$drive = "$($DriveLetter.ToUpper()):"
$partition = Get-Partition -DriveLetter $DriveLetter.ToUpper() | Select-Object -First 1
if (-not $partition) { throw "Drive $drive tidak ditemukan. Pasang flashdisk terlebih dahulu." }
$disk = Get-Disk -Number $partition.DiskNumber
if ($disk.BusType -ne 'USB') { throw "$drive tidak terdeteksi sebagai perangkat USB (BusType: $($disk.BusType))." }
$logical = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$drive'"
if (-not $logical -or [string]::IsNullOrWhiteSpace($logical.VolumeSerialNumber)) { throw "Serial volume tidak tersedia untuk $drive." }
$id = [guid]::NewGuid().ToString('N')
$marker = Join-Path "$drive\" '.evoting-dongle'
Set-Content -LiteralPath $marker -Value $id -NoNewline -Encoding ascii
$serial = ($logical.VolumeSerialNumber -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
Write-Host "`nUSB berhasil didaftarkan." -ForegroundColor Green
Write-Host "Tambahkan dua baris berikut ke server\.env:" -ForegroundColor Yellow
Write-Host "DONGLE_ID=$id"
Write-Host "DONGLE_VOLUME_SERIAL=$serial"
Write-Host "`nJangan hapus file $marker. Jangan bagikan nilai DONGLE_ID."
