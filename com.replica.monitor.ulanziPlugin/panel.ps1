# Talk to an MSI OLED monitor over its USB control interface (the HID
# device VID 1462, PID 3FA4 on the MPG 321URX), the way MSI's own app does.
#
#   panel.ps1 protect       run Panel Protect (pixel refresh) now
#   panel.ps1 send <text>   send one raw command, e.g. 5800110; print the reply
#   panel.ps1 serve         one command per line on stdin, one line of JSON out
#
# Commands are ASCII in a 64-byte report: report ID 01, the text, then \r.
# The monitor answers in the same shape; "5600+" is its acknowledgement.
# The monitor needs a USB upstream cable to this PC for any of this to work.
param(
  [Parameter(Position = 0)][string]$Command = 'protect',
  [Parameter(Position = 1)][string]$Text
)

$VendorId = '1462'
$ProductId = '3FA4'
# Captured from MSI's app starting Panel Protect.
$ProtectCommand = '5b00;10001'

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;

public static class MsiPanel {
  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr sec, uint disp, uint flags, IntPtr tmpl);

  public static string Send(string path, string text, int timeoutMs) {
    // GENERIC_READ|WRITE, share read/write so MSI's app can keep its handle,
    // OPEN_EXISTING, FILE_FLAG_OVERLAPPED so the read can time out.
    using (var handle = CreateFile(path, 0xC0000000, 3, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero)) {
      if (handle.IsInvalid) throw new IOException("Can't open the monitor (error " + Marshal.GetLastWin32Error() + ")");
      using (var stream = new FileStream(handle, FileAccess.ReadWrite, 64, true)) {
        var report = new byte[64];
        report[0] = 1;
        var body = Encoding.ASCII.GetBytes(text + "\r");
        Array.Copy(body, 0, report, 1, body.Length);
        stream.Write(report, 0, report.Length);

        // MSI's app may be polling too, so skip replies that aren't ours:
        // the reply to "Xy..." starts with the same first character.
        var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (true) {
          var left = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
          if (left <= 0) return null;
          var buf = new byte[64];
          var read = stream.ReadAsync(buf, 0, buf.Length);
          if (!read.Wait(left)) return null;
          var reply = Encoding.ASCII.GetString(buf, 1, read.Result - 1).Split('\r')[0];
          if (reply.Length > 0 && reply[0] == text[0]) return reply;
        }
      }
    }
  }
}
'@

function Get-PanelPath {
  $dev = Get-PnpDevice -PresentOnly -Class HIDClass -ErrorAction SilentlyContinue |
    Where-Object { $_.InstanceId -like "HID\VID_$VendorId&PID_$ProductId*" } | Select-Object -First 1
  if (-not $dev) { throw 'MSI monitor not found on USB' }
  # HID device interface GUID.
  return '\\?\' + ($dev.InstanceId -replace '\\', '#') + '#{4d1e55b2-f16f-11cf-88cb-001111000030}'
}

function Run([string]$cmd, [string]$arg) {
  $path = Get-PanelPath
  switch ($cmd) {
    'protect' { return [MsiPanel]::Send($path, $ProtectCommand, 1000) }
    'send' { return [MsiPanel]::Send($path, $arg, 1000) }
    default { throw "Unknown command: $cmd" }
  }
}

if ($Command -eq 'serve') {
  while (($line = [Console]::In.ReadLine()) -ne $null) {
    $parts = $line.Trim() -split '\s+', 2
    $result = $null
    try { $result = Run $parts[0] $parts[1] } catch { $result = $null }
    [Console]::Out.WriteLine((ConvertTo-Json -Compress $result))
  }
} else {
  Run $Command $Text
}
