Dim wsh
Set wsh = CreateObject("WScript.Shell")

Dim projectRoot
projectRoot = "C:\Users\FURSYS\Desktop\Python\LetusLogis"

wsh.CurrentDirectory = projectRoot

' 0 = 창 완전히 숨김, False = 기다리지 않고 바로 반환 (백그라운드 유지)
wsh.Run "cmd /c ""C:\Program Files\nodejs\node.exe"" scripts\worker.mjs >> logs\worker.log 2>&1", 0, False
