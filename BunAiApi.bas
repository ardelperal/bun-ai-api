Attribute VB_Name = "BunAiApi"
Option Explicit

Private Const API_BASE_URL As String = "https://ia.romancaba.com/v1"
Private Const API_KEY As String = "sk-bun-ai-secure-key-9cebe5bc-5312-4135-a1cb-3e129dd3d4a0"

' Hardcoded API key; update if you rotate secrets.

Public Function BunAi_ListModels(Optional ByRef statusCode As Long) As String
    Dim url As String
    url = API_BASE_URL & "/models"

    BunAi_ListModels = BunAi_SendRequest("GET", url, "", statusCode)
End Function

Public Function BunAi_ChatCompletionSimple(ByVal userMessage As String, Optional ByVal systemMessage As String = "", Optional ByVal model As String = "mi-modelo-chat", Optional ByVal provider As String = "", Optional ByRef statusCode As Long) As String
    Dim messagesJson As String
    Dim body As String
    Dim dq As String
    Dim providerJson As String

    dq = Chr(34)
    providerJson = ""
    If Len(provider) > 0 Then
        providerJson = "," & dq & "provider" & dq & ":" & dq & JsonEscape(provider) & dq
    End If
    messagesJson = "["
    If Len(systemMessage) > 0 Then
        messagesJson = messagesJson & "{" & dq & "role" & dq & ":" & dq & "system" & dq & "," & dq & "content" & dq & ":" & dq & JsonEscape(systemMessage) & dq & "},"
    End If
    messagesJson = messagesJson & "{" & dq & "role" & dq & ":" & dq & "user" & dq & "," & dq & "content" & dq & ":" & dq & JsonEscape(userMessage) & dq & "}]"

    body = "{" & dq & "model" & dq & ":" & dq & JsonEscape(model) & dq & providerJson & "," & dq & "messages" & dq & ":" & messagesJson & "}"
    BunAi_ChatCompletionSimple = BunAi_SendRequest("POST", API_BASE_URL & "/chat/completions", body, statusCode)
End Function

' Advanced: pass a JSON array of messages, for example:
' [{"role":"system","content":"Eres un asistente."},{"role":"user","content":"Hola"}]
Public Function BunAi_ChatCompletion(ByVal model As String, ByVal messagesJson As String, Optional ByVal provider As String = "", Optional ByVal temperature As Variant, Optional ByVal maxTokens As Variant, Optional ByVal stream As Variant, Optional ByRef statusCode As Long) As String
    Dim extras As String
    Dim body As String
    Dim dq As String
    Dim providerJson As String

    dq = Chr(34)
    providerJson = ""
    If Len(provider) > 0 Then
        providerJson = "," & dq & "provider" & dq & ":" & dq & JsonEscape(provider) & dq
    End If
    extras = ""
    If Not IsMissing(temperature) Then
        extras = extras & "," & dq & "temperature" & dq & ":" & CStr(temperature)
    End If
    If Not IsMissing(maxTokens) Then
        extras = extras & "," & dq & "max_tokens" & dq & ":" & CStr(maxTokens)
    End If
    If Not IsMissing(stream) Then
        If CBool(stream) Then
            extras = extras & "," & dq & "stream" & dq & ":true"
        Else
            extras = extras & "," & dq & "stream" & dq & ":false"
        End If
    End If

    body = "{" & dq & "model" & dq & ":" & dq & JsonEscape(model) & dq & providerJson & "," & dq & "messages" & dq & ":" & messagesJson & extras & "}"
    BunAi_ChatCompletion = BunAi_SendRequest("POST", API_BASE_URL & "/chat/completions", body, statusCode)
End Function

Private Function BunAi_SendRequest(ByVal method As String, ByVal url As String, ByVal body As String, ByRef statusCode As Long) As String
    Dim http As Object
    Set http = CreateObject("MSXML2.XMLHTTP.6.0")

    http.Open method, url, False
    http.setRequestHeader "Authorization", "Bearer " & API_KEY
    If method = "POST" Then
        http.setRequestHeader "Content-Type", "application/json"
    End If

    http.send body
    statusCode = http.status
    BunAi_SendRequest = http.responseText
End Function

Private Function JsonEscape(ByVal value As String) As String
    Dim result As String
    Dim dq As String
    Dim bs As String

    dq = Chr(34)
    bs = Chr(92)
    result = value
    result = Replace(result, bs, bs & bs)
    result = Replace(result, dq, bs & dq)
    result = Replace(result, vbCrLf, "\n")
    result = Replace(result, vbCr, "\n")
    result = Replace(result, vbLf, "\n")
    result = Replace(result, vbTab, "\t")

    JsonEscape = result
End Function

' Example usage (Immediate Window):
' Dim status As Long
' Debug.Print BunAi_ListModels(status)
' Debug.Print "Status: "; status
'
' Debug.Print BunAi_ChatCompletionSimple("Hola, responde corto.", "Eres un asistente util.", "mi-modelo-chat", status)
' Debug.Print "Status: "; status
