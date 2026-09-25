$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$term = $env:DINOX_SEARCH_TERM.Replace("'", "''")
$connection = New-Object -ComObject ADODB.Connection
try {
  $connection.ConnectionTimeout = 2
  $connection.CommandTimeout = 3
  $connection.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
  $rows = $connection.Execute("SELECT TOP 25 System.ItemNameDisplay, System.ItemUrl FROM SystemIndex WHERE System.FileName LIKE '%$term%' ORDER BY System.DateModified DESC")
  $items = @()
  while (-not $rows.EOF) {
    $uri = [uri][string]$rows.Fields.Item('System.ItemUrl').Value
    if ($uri.IsFile -and -not $uri.IsUnc) {
      $items += @{ name=[string]$rows.Fields.Item('System.ItemNameDisplay').Value; path=$uri.LocalPath }
    }
    $rows.MoveNext()
  }
  ConvertTo-Json -InputObject @($items) -Compress
} finally {
  if ($null -ne $rows) { $rows.Close() }
  if ($connection.State -ne 0) { $connection.Close() }
}
