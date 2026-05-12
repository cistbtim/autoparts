' ============================================================
'  ExportPartPhotos — VB6 Form Code  (DBPix 2.0)
'
'  Controls on the form:
'    txtPartNo   TextBox   Locked=True
'    txtDesc     TextBox   Locked=True, MultiLine=True
'    lblRecord   Label
'    lblStatus   Label
'    DBPix1      DBPix 2.0 OCX   Stretch=True
'    cmdFirst / cmdPrev / cmdNext / cmdLast   CommandButtons
'    cmdSaveThis  "Save This Photo"
'    cmdSaveAll   "Save ALL Photos"
'
'  Project > References:
'    Microsoft ActiveX Data Objects 2.x Library
'  Project > Components:
'    DBPix 2.0 ActiveX Control
' ============================================================

Option Explicit

' ── CONFIG ───────────────────────────────────────────────────
Const DB_DSN      As String = "warehouse"
Const DB_TABLE    As String = "cpitem"
Const COL_PARTNO  As String = "cpitemid"
Const COL_DESC    As String = "cpitemDesc"
Const COL_IMAGE   As String = "Picture"
Const SAVE_FOLDER As String = "C:\parts_pics\"
Const SAVE_DELAY  As Single = 1          ' seconds between each photo fetch
' ─────────────────────────────────────────────────────────────

Dim conn      As ADODB.Connection
Dim rs        As ADODB.Recordset   ' text only — no image blob
Dim rsImg     As ADODB.Recordset   ' kept open so DBPix can read it
Dim totalRecs As Long

' ── Startup ──────────────────────────────────────────────────

Private Sub Form_Load()
    If Dir(SAVE_FOLDER, vbDirectory) = "" Then MkDir SAVE_FOLDER

    Set conn = New ADODB.Connection
    conn.ConnectionString = "DSN=" & DB_DSN & ";"

    On Error GoTo ConnErr
    conn.Open
    On Error GoTo 0

    ' Main recordset — cpitemid + cpitemDesc only, NO Picture
    Set rs = New ADODB.Recordset
    rs.Open "SELECT [" & COL_PARTNO & "],[" & COL_DESC & "] " & _
            "FROM [" & DB_TABLE & "] ORDER BY [" & COL_PARTNO & "]", _
            conn, adOpenStatic, adLockReadOnly

    totalRecs = rs.RecordCount
    lblStatus.Caption = "Loaded " & totalRecs & " records"
    ShowCurrent
    Exit Sub

ConnErr:
    MsgBox "Cannot connect:" & vbCrLf & Err.Description, vbCritical
    Unload Me
End Sub

' ── Show current record ───────────────────────────────────────

Private Sub ShowCurrent()
    If rs.BOF Or rs.EOF Then Exit Sub
    txtPartNo.Text    = NullStr(rs(COL_PARTNO))
    txtDesc.Text      = NullStr(rs(COL_DESC))
    lblRecord.Caption = rs.AbsolutePosition & " / " & totalRecs
    FetchAndShowImage NullStr(rs(COL_PARTNO))
End Sub

' ── Fetch image for one part and bind to DBPix ───────────────

Private Sub FetchAndShowImage(partNo As String)
    lblStatus.Caption = "Loading image..."
    DoEvents

    ' Close previous image recordset
    On Error Resume Next
    If Not rsImg Is Nothing Then
        If rsImg.State = adStateOpen Then rsImg.Close
    End If
    Set rsImg = Nothing
    On Error GoTo 0

    On Error GoTo ImgErr
    Set rsImg = New ADODB.Recordset
    ' Use adOpenStatic so DBPix can read it after Open
    rsImg.Open "SELECT [" & COL_IMAGE & "] FROM [" & DB_TABLE & "] " & _
               "WHERE [" & COL_PARTNO & "] = '" & partNo & "'", _
               conn, adOpenStatic, adLockReadOnly

    If Not rsImg.EOF And Not IsNull(rsImg(COL_IMAGE)) Then
        ' DBPix 2.0: bind via DataSource + DataField
        Set DBPix1.DataSource = rsImg
        DBPix1.DataField = COL_IMAGE
        lblStatus.Caption = ""
    Else
        Set DBPix1.DataSource = Nothing
        lblStatus.Caption = "No image"
    End If
    ' Note: rsImg stays OPEN — DBPix needs it to display the image
    Exit Sub

ImgErr:
    lblStatus.Caption = "Image error: " & Err.Description
End Sub

' ── Navigation ───────────────────────────────────────────────

Private Sub cmdFirst_Click()
    rs.MoveFirst : ShowCurrent
End Sub

Private Sub cmdPrev_Click()
    rs.MovePrevious
    If rs.BOF Then rs.MoveFirst
    ShowCurrent
End Sub

Private Sub cmdNext_Click()
    rs.MoveNext
    If rs.EOF Then rs.MoveLast
    ShowCurrent
End Sub

Private Sub cmdLast_Click()
    rs.MoveLast : ShowCurrent
End Sub

' ── Save current photo ────────────────────────────────────────

Private Sub cmdSaveThis_Click()
    Dim partNo As String
    partNo = SafePartNo(rs(COL_PARTNO))
    If SavePhoto(NullStr(rs(COL_PARTNO)), partNo) Then
        lblStatus.Caption = "Saved: " & partNo & ".jpg"
    End If
End Sub

' ── Save ALL photos ───────────────────────────────────────────

Private Sub cmdSaveAll_Click()
    Dim saved   As Long
    Dim skipped As Long
    Dim rawID   As String
    Dim partNo  As String

    If MsgBox("Save ALL " & totalRecs & " photos to " & SAVE_FOLDER & "?" & _
              vbCrLf & "This may take a few minutes.", _
              vbYesNo + vbQuestion, "Confirm") = vbNo Then Exit Sub

    cmdSaveAll.Enabled  = False
    cmdSaveThis.Enabled = False

    rs.MoveFirst
    Do While Not rs.EOF
        rawID  = NullStr(rs(COL_PARTNO))
        partNo = SafePartNo(rawID)

        lblStatus.Caption = "[" & (saved + skipped + 1) & "/" & totalRecs & _
                            "] " & partNo & " — waiting..."
        DoEvents

        Wait SAVE_DELAY   ' 1-second pause before fetching blob

        lblStatus.Caption = "[" & (saved + skipped + 1) & "/" & totalRecs & _
                            "] " & partNo & " — saving..."
        DoEvents

        If SavePhoto(rawID, partNo) Then
            saved = saved + 1
        Else
            skipped = skipped + 1
        End If

        lblStatus.Caption = "Saved: " & saved & "  Skipped: " & skipped & " / " & totalRecs
        DoEvents
        rs.MoveNext
    Loop

    cmdSaveAll.Enabled  = True
    cmdSaveThis.Enabled = True

    MsgBox "Done!" & vbCrLf & _
           "Saved  : " & saved & vbCrLf & _
           "Skipped: " & skipped & vbCrLf & vbCrLf & _
           "Folder : " & SAVE_FOLDER, vbInformation, "Export Complete"
End Sub

' ── Fetch one image from DB, show in DBPix, save to disk ─────

Private Function SavePhoto(rawID As String, partNo As String) As Boolean
    Dim rsSave   As ADODB.Recordset
    Dim filePath As String
    SavePhoto = False
    filePath = SAVE_FOLDER & partNo & ".jpg"

    On Error GoTo Err_Save
    Set rsSave = New ADODB.Recordset
    rsSave.Open "SELECT [" & COL_IMAGE & "] FROM [" & DB_TABLE & "] " & _
                "WHERE [" & COL_PARTNO & "] = '" & rawID & "'", _
                conn, adOpenStatic, adLockReadOnly

    If rsSave.EOF Or IsNull(rsSave(COL_IMAGE)) Then
        rsSave.Close : Set rsSave = Nothing
        Exit Function
    End If

    ' Bind to DBPix then save immediately before closing recordset
    Set DBPix1.DataSource = rsSave
    DBPix1.DataField = COL_IMAGE
    DBPix1.ImageSaveFile filePath   ' DBPix 2.0 correct save method

    rsSave.Close
    Set rsSave = Nothing
    SavePhoto = True
    Exit Function

Err_Save:
    On Error Resume Next
    If Not rsSave Is Nothing Then rsSave.Close
    Set rsSave = Nothing
End Function

' ── Wait N seconds keeping UI alive ──────────────────────────

Private Sub Wait(seconds As Single)
    Dim t As Single
    t = Timer
    Do While Timer < t + seconds
        DoEvents
    Loop
End Sub

' ── Helpers ───────────────────────────────────────────────────

Private Function NullStr(v As Variant) As String
    If IsNull(v) Then NullStr = "" Else NullStr = CStr(v)
End Function

Private Function SafePartNo(v As Variant) As String
    Dim s As String
    Dim i As Integer
    Dim illegal As String
    illegal = "\/:*?""<>|"
    s = Trim(NullStr(v))
    For i = 1 To Len(illegal)
        s = Replace(s, Mid(illegal, i, 1), "_")
    Next i
    SafePartNo = s
End Function

' ── Cleanup ───────────────────────────────────────────────────

Private Sub Form_Unload(Cancel As Integer)
    On Error Resume Next
    If Not rsImg Is Nothing Then
        If rsImg.State = adStateOpen Then rsImg.Close
        Set rsImg = Nothing
    End If
    If Not rs Is Nothing Then
        If rs.State = adStateOpen Then rs.Close
        Set rs = Nothing
    End If
    If Not conn Is Nothing Then
        If conn.State = adStateOpen Then conn.Close
        Set conn = Nothing
    End If
End Sub
