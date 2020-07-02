@echo off

rem formatlist.bat: a batch file for listing supported formats in Bio-Formats

rem Required JARs: loci_tools.jar or bioformats_package.jar

setlocal
set BF_DIR=%~dp0
if "%BF_DIR:~-1%" == "\" set BF_DIR=%BF_DIR:~0,-1%

set BF_PROG=loci.formats.tools.PrintFormatTable
call "%BF_DIR%\bf.bat" %*
