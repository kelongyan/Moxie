; Moxie's installer hooks (`bundle > windows > nsis > installerHooks` in
; tauri.windows.conf.json): what keeps Moxie under "Open with" for .md and
; .markdown, and in Settings > Apps > Default apps, whichever app holds the
; default. See docs/dev/windows-installer.md > File associations.
;
; The template's own association (from `bundle.fileAssociations`) only sets
; the extension's default value to Moxie's ProgID. Another editor's installer
; replaces that value, and with it the only thing that named Moxie for .md
; (#183). The values below are each Moxie's own, so nothing else overwrites
; them.
;
; Per-user, like the install (`installMode` is `currentUser`). The same set
; is written by Settings > General > Default Markdown editor
; (src-tauri/src/commands/default_editor.rs) - change both.

!define MOXIE_PROGID "Moxie.Markdown"
!define MOXIE_CAPABILITIES "Software\Moxie\Capabilities"
!define MOXIE_APPKEY "Software\Classes\Applications\${MAINBINARYNAME}.exe"

!macro MOXIE_REGISTER_EXT EXT
  WriteRegNone HKCU "Software\Classes\${EXT}\OpenWithProgids" "${MOXIE_PROGID}"
  WriteRegStr HKCU "${MOXIE_APPKEY}\SupportedTypes" "${EXT}" ""
  WriteRegStr HKCU "${MOXIE_CAPABILITIES}\FileAssociations" "${EXT}" "${MOXIE_PROGID}"
!macroend

!macro MOXIE_UNREGISTER_EXT EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "${MOXIE_PROGID}"
  DeleteRegKey /ifempty HKCU "Software\Classes\${EXT}\OpenWithProgids"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; The template writes the ProgID's command with the path unquoted, which
  ; breaks in a folder with a space in its name.
  WriteRegStr HKCU "Software\Classes\${MOXIE_PROGID}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'

  WriteRegStr HKCU "${MOXIE_APPKEY}" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr HKCU "${MOXIE_APPKEY}\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "${MOXIE_CAPABILITIES}" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr HKCU "${MOXIE_CAPABILITIES}" "ApplicationDescription" "Markdown editor"
  WriteRegStr HKCU "Software\RegisteredApplications" "${PRODUCTNAME}" "${MOXIE_CAPABILITIES}"
  !insertmacro MOXIE_REGISTER_EXT ".md"
  !insertmacro MOXIE_REGISTER_EXT ".markdown"

  ; Explorer caches file types until the next sign-in otherwise.
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; An uninstall run for an upgrade (/UPDATE) is followed by an install
  ; that would write all of this again.
  ${If} $UpdateMode <> 1
    !insertmacro MOXIE_UNREGISTER_EXT ".md"
    !insertmacro MOXIE_UNREGISTER_EXT ".markdown"
    DeleteRegKey HKCU "${MOXIE_APPKEY}"
    DeleteRegValue HKCU "Software\RegisteredApplications" "${PRODUCTNAME}"
    DeleteRegKey HKCU "${MOXIE_CAPABILITIES}"
    DeleteRegKey /ifempty HKCU "Software\Moxie"

    ; The `textus` command Moxie installs itself (src-tauri/src/commands/cli.rs).
    ; A PATH as long as NSIS' strings comes back cut short, so it's left alone.
    Delete "$INSTDIR\bin\textus.cmd"
    RMDir "$INSTDIR\bin"
    ReadRegStr $R0 HKCU "Environment" "Path"
    StrLen $R1 $R0
    IntOp $R1 $R1 + 1
    ${If} $R1 < ${NSIS_MAX_STRLEN}
      ${WordAdd} $R0 ";" "-$INSTDIR\bin" $R2
      ; Written back only when exactly our folder (and a ";") is gone:
      ; anything shorter would lose the user's own entries.
      StrLen $R3 $R2
      StrLen $R4 "$INSTDIR\bin"
      IntOp $R3 $R3 + $R4
      IntOp $R3 $R3 + 1
      StrLen $R4 $R0
      ${If} $R2 != $R0
        ${AndIf} $R3 >= $R4
          WriteRegExpandStr HKCU "Environment" "Path" $R2
          SendMessage ${HWND_BROADCAST} ${WM_SETTINGCHANGE} 0 "STR:Environment" /TIMEOUT=5000
      ${EndIf}
    ${EndIf}

    ; Up to 1.1.0-rc.6 Moxie's ProgID was "Markdown", a name other editors
    ; share. Removed only while it still opens this copy of Moxie.
    ReadRegStr $R0 HKCU "Software\Classes\Markdown\shell\open\command" ""
    ${If} $R0 == '$INSTDIR\${MAINBINARYNAME}.exe "%1"'
      DeleteRegKey HKCU "Software\Classes\Markdown"
    ${EndIf}

    !insertmacro UPDATEFILEASSOC
  ${EndIf}
!macroend
