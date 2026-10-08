@echo off
rem 顧客フォルダ作成（ダブルクリックで実行）
rem このファイルは python フォルダ内に置いてください
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"

echo ==========================================
echo    Create customer folders / フォルダ作成
echo ==========================================
echo.

python create_folders.py
if errorlevel 9009 (
  echo.
  echo "python" not found. Trying "py" ...
  py create_folders.py
)

echo.
echo ==========================================
echo    Finished. / 終了しました
echo    You can close this window.
echo ==========================================
pause
