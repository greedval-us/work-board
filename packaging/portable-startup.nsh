!include "LogicLib.nsh"
!include "WinMessages.nsh"

Var startupWindow
Var startupBitmap
Var startupStyle
Var startupMode
Var startupBarX
Var startupBarY
Var startupBarWidth
Var startupBarHeight

!ifndef WORK_BOARD_APPEARANCE_INI
  !define WORK_BOARD_APPEARANCE_INI "$APPDATA\Work Board\startup-appearance.ini"
!endif

Function ShowWorkBoardSplash
  InitPluginsDir
  ReadINIStr $startupStyle "${WORK_BOARD_APPEARANCE_INI}" "Appearance" "style"
  ReadINIStr $startupMode "${WORK_BOARD_APPEARANCE_INI}" "Appearance" "theme"
  ${If} $startupMode == "system"
    ClearErrors
    ReadRegDWORD $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Themes\Personalize" "AppsUseLightTheme"
    ${IfNot} ${Errors}
    ${AndIf} $0 == 0
      StrCpy $startupMode "dark"
    ${EndIf}
  ${EndIf}
  !insertmacro ExtractWorkBoardSplash

  ; A nonactivating bitmap popup owns a native AVI control. Windows plays the
  ; captured progress strip on its own thread while NSIS decompresses the app.
  System::Call 'user32::LoadImageW(p 0, w "$PLUGINSDIR\startup.bmp", i 0, i 0, i 0, i 0x2010) p .r0'
  StrCpy $startupBitmap $0
  ${If} $startupBitmap == 0
    Return
  ${EndIf}
  System::Call 'user32::GetSystemMetrics(i 0) i .r0'
  IntOp $0 $0 - ${WB_SPLASH_WIDTH}
  IntOp $0 $0 / 2
  System::Call 'user32::GetSystemMetrics(i 1) i .r1'
  IntOp $1 $1 - ${WB_SPLASH_HEIGHT}
  IntOp $1 $1 / 2
  System::Call 'user32::CreateWindowExW(i 0x08000080, w "STATIC", w "Work Board", i 0x8200000E, i r0, i r1, i ${WB_SPLASH_WIDTH}, i ${WB_SPLASH_HEIGHT}, p 0, p 0, p 0, p 0) p .r2'
  StrCpy $startupWindow $2
  SendMessage $startupWindow ${STM_SETIMAGE} 0 $startupBitmap
  System::Call 'user32::ShowWindow(p r2, i 4)'
  System::Call 'user32::UpdateWindow(p r2)'
  ; SPI_GETCLIENTAREAANIMATION honours Windows' reduced-motion setting.
  System::Call 'user32::SystemParametersInfoW(i 0x1042, i 0, *i .r3, i 0) i .r4'
  ${If} $4 != 0
  ${AndIf} $3 == 0
    Return
  ${EndIf}
  System::Call 'comctl32::InitCommonControls()'
  StrCpy $3 $startupBarX
  StrCpy $4 $startupBarY
  StrCpy $5 $startupBarWidth
  StrCpy $6 $startupBarHeight
  System::Call 'user32::CreateWindowExW(i 0, w "SysAnimate32", w "", i 0x40000000, i r3, i r4, i r5, i r6, p r2, p 0, p 0, p 0) p .r7'
  SendMessage $7 ${ACM_OPENW} 0 "STR:$PLUGINSDIR\startup.avi" $8
  ${If} $8 != 0
    System::Call 'user32::ShowWindow(p r7, i 4)'
    SendMessage $7 ${ACM_PLAY} -1 0xFFFF0000
  ${EndIf}
FunctionEnd

Function CloseWorkBoardSplash
  ; The section runs on a worker: let the window's owning UI thread close it.
  SendMessage $startupWindow ${WM_CLOSE} 0 0
  System::Call 'gdi32::DeleteObject(p $startupBitmap)'
FunctionEnd
