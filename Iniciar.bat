@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
set "MJ_NODE=node.exe"
where.exe node.exe >nul 2>&1
if not errorlevel 1 goto check_node
set "MJ_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%MJ_NODE%" goto check_node
echo Node.js nao encontrado. Instale o Node.js 24 LTS e abra este arquivo novamente.
pause
exit /b 1

:check_node
"%MJ_NODE%" -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22 || (v[0]===22 && v[1]>=13) ? 0 : 1)" >nul 2>&1
if errorlevel 1 goto old_node
echo Mecanica Ja - mantenha esta janela aberta durante o uso.
echo Abra http://127.0.0.1:3000 no navegador.
"%MJ_NODE%" --env-file-if-exists=.env "%~dp0server.mjs"
set "MJ_EXIT=%ERRORLEVEL%"
if "%MJ_EXIT%"=="0" exit /b 0
echo.
echo O servidor encerrou com erro. Confira a mensagem exibida acima.
pause
exit /b %MJ_EXIT%

:old_node
echo O Node.js encontrado precisa ser atualizado para a versao 24 LTS.
echo Esta aplicacao exige pelo menos Node.js 22.13.
pause
exit /b 1
