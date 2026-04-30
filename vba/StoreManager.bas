Attribute VB_Name = "StoreManager"
Option Explicit

Private Const SHEET_MENU As String = "MENU"
Private Const SHEET_DASHBOARD As String = "DASHBOARD"
Private Const SHEET_FORM_INVOICE As String = "TẠO_HÓA_ĐƠN"
Private Const SHEET_FORM_VOUCHER As String = "PHIẾU_THU_CHI"
Private Const SHEET_CUSTOMERS As String = "KHÁCH HÀNG"
Private Const SHEET_PRODUCTS As String = "Hàng Q302"
Private Const SHEET_INVOICE_DETAILS As String = "CHI TIẾT HÓA ĐƠN"
Private Const SHEET_DEBTS As String = "CÔNG NỢ THEO HÓA ĐƠN"
Private Const SHEET_PRINT As String = "LÊN HÓA ĐƠN"
Private Const SHEET_LEDGER As String = "SỔ_THU_CHI"

Public Sub GoToMenu()
    Worksheets(SHEET_MENU).Activate
End Sub

Public Sub GoToDashboard()
    Worksheets(SHEET_DASHBOARD).Activate
End Sub

Public Sub CreateInvoiceFromForm()
    Dim wsForm As Worksheet
    Dim wsCustomers As Worksheet
    Dim wsProducts As Worksheet
    Dim wsDetails As Worksheet
    Dim wsDebts As Worksheet
    Dim wsPrint As Worksheet
    Dim customerCode As String
    Dim customerName As String
    Dim customerAddress As String
    Dim customerPhone As String
    Dim noteText As String
    Dim invoiceCode As String
    Dim formRow As Long
    Dim detailRow As Long
    Dim printRow As Long
    Dim productRow As Long
    Dim qty As Double
    Dim price As Double
    Dim lineTotal As Double
    Dim grandTotal As Double
    Dim lineCount As Long
    Dim productCode As String
    Dim productName As String

    Set wsForm = Worksheets(SHEET_FORM_INVOICE)
    Set wsCustomers = Worksheets(SHEET_CUSTOMERS)
    Set wsProducts = Worksheets(SHEET_PRODUCTS)
    Set wsDetails = Worksheets(SHEET_INVOICE_DETAILS)
    Set wsDebts = Worksheets(SHEET_DEBTS)
    Set wsPrint = Worksheets(SHEET_PRINT)

    customerCode = Trim$(CStr(wsForm.Range("B2").Value))
    noteText = Trim$(CStr(wsForm.Range("B4").Value))

    If customerCode = "" Then
        MsgBox "Bạn cần nhập mã khách hàng ở ô B2.", vbExclamation
        Exit Sub
    End If

    customerName = FindValueByKey(wsCustomers, 2, customerCode, 3)
    customerAddress = FindValueByKey(wsCustomers, 2, customerCode, 5)
    customerPhone = FindValueByKey(wsCustomers, 2, customerCode, 4)

    If customerName = "" Then
        MsgBox "Không tìm thấy khách hàng với mã " & customerCode, vbExclamation
        Exit Sub
    End If

    invoiceCode = NextCode(Worksheets(SHEET_INVOICE_DETAILS), 1, "HD", 4)
    grandTotal = 0
    lineCount = 0

    ClearPrintTemplate wsPrint
    FillPrintHeader wsPrint, invoiceCode, customerCode, customerName, customerAddress, customerPhone, noteText

    For formRow = 6 To 30
        productCode = Trim$(CStr(wsForm.Cells(formRow, 1).Value))
        If productCode <> "" Then
            qty = SafeToDouble(wsForm.Cells(formRow, 2).Value)
            If qty <= 0 Then
                MsgBox "Số lượng tại dòng " & formRow & " không hợp lệ.", vbExclamation
                Exit Sub
            End If

            productRow = FindRowByValue(wsProducts, 3, productCode)
            If productRow = 0 Then
                MsgBox "Không tìm thấy mã hàng " & productCode, vbExclamation
                Exit Sub
            End If

            productName = Trim$(CStr(wsProducts.Cells(productRow, 4).Value))
            price = SafeToDouble(wsProducts.Cells(productRow, 6).Value)
            lineTotal = qty * price
            grandTotal = grandTotal + lineTotal
            lineCount = lineCount + 1

            detailRow = NextEmptyRow(wsDetails, 1)
            wsDetails.Cells(detailRow, 1).Value = invoiceCode
            wsDetails.Cells(detailRow, 2).Value = Now
            wsDetails.Cells(detailRow, 3).Value = customerCode
            wsDetails.Cells(detailRow, 4).Value = customerName
            wsDetails.Cells(detailRow, 5).Value = productCode
            wsDetails.Cells(detailRow, 6).Value = productName
            wsDetails.Cells(detailRow, 7).Value = qty
            wsDetails.Cells(detailRow, 8).Value = price
            wsDetails.Cells(detailRow, 9).Value = lineTotal
            If lineCount = 1 Then wsDetails.Cells(detailRow, 10).Value = grandTotal

            wsProducts.Cells(productRow, 7).Value = SafeToDouble(wsProducts.Cells(productRow, 7).Value) - qty

            printRow = 14 + lineCount
            wsPrint.Cells(printRow, 1).Value = lineCount
            wsPrint.Cells(printRow, 2).Value = productCode
            wsPrint.Cells(printRow, 3).Value = productName
            wsPrint.Cells(printRow, 5).Value = qty
            wsPrint.Cells(printRow, 6).Value = price
            wsPrint.Cells(printRow, 7).Value = lineTotal
        End If
    Next formRow

    If lineCount = 0 Then
        MsgBox "Bạn chưa nhập dòng hàng nào.", vbExclamation
        Exit Sub
    End If

    UpdateDebtTable invoiceCode, customerCode, customerName, customerPhone, noteText, grandTotal, 0
    UpdateCustomerTotals customerCode, grandTotal
    FinalizePrintTemplate wsPrint, grandTotal, noteText

    wsForm.Range("B3").Value = customerName
    wsForm.Range("A6:B30").ClearContents
    wsPrint.Activate
    MsgBox "Đã tạo hóa đơn " & invoiceCode & " với tổng tiền " & FormatCurrency(grandTotal), vbInformation
End Sub

Public Sub CreateVoucherFromForm()
    Dim wsForm As Worksheet
    Dim wsLedger As Worksheet
    Dim wsDebts As Worksheet
    Dim voucherCode As String
    Dim voucherType As String
    Dim customerCode As String
    Dim customerName As String
    Dim invoiceCode As String
    Dim amount As Double
    Dim noteText As String
    Dim targetRow As Long
    Dim debtRow As Long

    Set wsForm = Worksheets(SHEET_FORM_VOUCHER)
    Set wsLedger = Worksheets(SHEET_LEDGER)
    Set wsDebts = Worksheets(SHEET_DEBTS)

    voucherType = LCase$(Trim$(CStr(wsForm.Range("B2").Value)))
    customerCode = Trim$(CStr(wsForm.Range("B3").Value))
    invoiceCode = Trim$(CStr(wsForm.Range("B4").Value))
    amount = SafeToDouble(wsForm.Range("B5").Value)
    noteText = Trim$(CStr(wsForm.Range("B7").Value))

    If voucherType <> "receipt" And voucherType <> "payment" Then
        MsgBox "Loại phiếu chỉ nhận receipt hoặc payment.", vbExclamation
        Exit Sub
    End If
    If amount <= 0 Then
        MsgBox "Số tiền phải lớn hơn 0.", vbExclamation
        Exit Sub
    End If

    customerName = FindValueByKey(Worksheets(SHEET_CUSTOMERS), 2, customerCode, 3)
    voucherCode = NextCode(wsLedger, 1, IIf(voucherType = "receipt", "PT", "PC"), 4)
    targetRow = NextEmptyRow(wsLedger, 1)

    wsLedger.Cells(targetRow, 1).Value = voucherCode
    wsLedger.Cells(targetRow, 2).Value = Now
    wsLedger.Cells(targetRow, 3).Value = voucherType
    wsLedger.Cells(targetRow, 4).Value = customerCode
    wsLedger.Cells(targetRow, 5).Value = customerName
    wsLedger.Cells(targetRow, 6).Value = invoiceCode
    wsLedger.Cells(targetRow, 7).Value = amount
    wsLedger.Cells(targetRow, 8).Value = noteText

    If voucherType = "receipt" And invoiceCode <> "" Then
        debtRow = FindRowByValue(wsDebts, 1, invoiceCode)
        If debtRow > 0 Then
            wsDebts.Cells(debtRow, 8).Value = SafeToDouble(wsDebts.Cells(debtRow, 8).Value) + amount
        End If
    End If

    wsForm.Range("B2:B7").ClearContents
    wsForm.Range("B2").Value = "receipt"
    MsgBox "Đã tạo phiếu " & voucherCode, vbInformation
End Sub

Public Sub FillCustomerNameOnForm()
    Dim customerCode As String
    customerCode = Trim$(CStr(Worksheets(SHEET_FORM_INVOICE).Range("B2").Value))
    If customerCode = "" Then Exit Sub
    Worksheets(SHEET_FORM_INVOICE).Range("B3").Value = FindValueByKey(Worksheets(SHEET_CUSTOMERS), 2, customerCode, 3)
End Sub

Public Sub RefreshDashboard()
    Application.CalculateFull
    Worksheets(SHEET_DASHBOARD).Activate
    MsgBox "Đã cập nhật Dashboard.", vbInformation
End Sub

Private Sub UpdateDebtTable(ByVal invoiceCode As String, ByVal customerCode As String, ByVal customerName As String, ByVal customerPhone As String, ByVal noteText As String, ByVal amountDue As Double, ByVal amountPaid As Double)
    Dim wsDebts As Worksheet
    Dim targetRow As Long

    Set wsDebts = Worksheets(SHEET_DEBTS)
    targetRow = NextEmptyRow(wsDebts, 1)

    wsDebts.Cells(targetRow, 1).Value = invoiceCode
    wsDebts.Cells(targetRow, 2).Value = Now
    wsDebts.Cells(targetRow, 3).Value = customerCode
    wsDebts.Cells(targetRow, 4).Value = customerName
    wsDebts.Cells(targetRow, 5).Value = customerPhone
    wsDebts.Cells(targetRow, 6).Value = noteText
    wsDebts.Cells(targetRow, 7).Value = amountDue
    wsDebts.Cells(targetRow, 8).Value = amountPaid
End Sub

Private Sub UpdateCustomerTotals(ByVal customerCode As String, ByVal amountValue As Double)
    Dim wsCustomers As Worksheet
    Dim targetRow As Long

    Set wsCustomers = Worksheets(SHEET_CUSTOMERS)
    targetRow = FindRowByValue(wsCustomers, 2, customerCode)
    If targetRow = 0 Then Exit Sub

    wsCustomers.Cells(targetRow, 7).Value = SafeToDouble(wsCustomers.Cells(targetRow, 7).Value) + amountValue
    wsCustomers.Cells(targetRow, 8).Value = SafeToDouble(wsCustomers.Cells(targetRow, 8).Value) + amountValue
End Sub

Private Sub FillPrintHeader(ByVal wsPrint As Worksheet, ByVal invoiceCode As String, ByVal customerCode As String, ByVal customerName As String, ByVal customerAddress As String, ByVal customerPhone As String, ByVal noteText As String)
    wsPrint.Range("A6").Value = invoiceCode
    wsPrint.Range("B9").Value = customerCode
    wsPrint.Range("B10").Value = customerName
    wsPrint.Range("C10").Value = customerName
    wsPrint.Range("B11").Value = customerAddress
    wsPrint.Range("B12").Value = customerPhone
    wsPrint.Range("B34").Value = noteText
End Sub

Private Sub FinalizePrintTemplate(ByVal wsPrint As Worksheet, ByVal grandTotal As Double, ByVal noteText As String)
    wsPrint.Range("G22").Value = grandTotal
    wsPrint.Range("G27").Value = 0
    wsPrint.Range("G28").Value = grandTotal
    wsPrint.Range("B34").Value = noteText
End Sub

Private Sub ClearPrintTemplate(ByVal wsPrint As Worksheet)
    wsPrint.Range("A15:G21").ClearContents
    wsPrint.Range("A6").ClearContents
    wsPrint.Range("B9:B12").ClearContents
    wsPrint.Range("C10").ClearContents
    wsPrint.Range("G22:G28").ClearContents
    wsPrint.Range("B34").ClearContents
End Sub

Private Function NextEmptyRow(ByVal ws As Worksheet, ByVal keyCol As Long) As Long
    NextEmptyRow = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row + 1
End Function

Private Function FindRowByValue(ByVal ws As Worksheet, ByVal keyCol As Long, ByVal keyValue As String) As Long
    Dim lastRow As Long
    Dim i As Long
    lastRow = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row
    For i = 2 To lastRow
        If Trim$(CStr(ws.Cells(i, keyCol).Value)) = keyValue Then
            FindRowByValue = i
            Exit Function
        End If
    Next i
    FindRowByValue = 0
End Function

Private Function FindValueByKey(ByVal ws As Worksheet, ByVal keyCol As Long, ByVal keyValue As String, ByVal returnCol As Long) As String
    Dim foundRow As Long
    foundRow = FindRowByValue(ws, keyCol, keyValue)
    If foundRow = 0 Then
        FindValueByKey = ""
    Else
        FindValueByKey = Trim$(CStr(ws.Cells(foundRow, returnCol).Value))
    End If
End Function

Private Function NextCode(ByVal ws As Worksheet, ByVal keyCol As Long, ByVal prefix As String, ByVal widthNum As Long) As String
    Dim lastRow As Long
    Dim i As Long
    Dim codeText As String
    Dim maxNumber As Long
    Dim numericPart As String

    lastRow = ws.Cells(ws.Rows.Count, keyCol).End(xlUp).Row
    maxNumber = 0
    For i = 2 To lastRow
        codeText = Trim$(CStr(ws.Cells(i, keyCol).Value))
        If Left$(codeText, Len(prefix)) = prefix Then
            numericPart = Mid$(codeText, Len(prefix) + 1)
            If IsNumeric(numericPart) Then
                If CLng(numericPart) > maxNumber Then maxNumber = CLng(numericPart)
            End If
        End If
    Next i

    NextCode = prefix & Format$(maxNumber + 1, String$(widthNum, "0"))
End Function

Private Function SafeToDouble(ByVal rawValue As Variant) As Double
    If IsError(rawValue) Then
        SafeToDouble = 0
    ElseIf Trim$(CStr(rawValue)) = "" Then
        SafeToDouble = 0
    ElseIf IsNumeric(rawValue) Then
        SafeToDouble = CDbl(rawValue)
    Else
        SafeToDouble = Val(Replace(CStr(rawValue), ",", ""))
    End If
End Function
