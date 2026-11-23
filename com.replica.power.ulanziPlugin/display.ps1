# Turn the displays off and on the way Windows does at idle. Off stops the
# video signal, so the monitor goes to standby; a mouse nudge brings it back.
#
#   display.ps1 off       turn every display off
#   display.ps1 on        wake the displays
#   display.ps1 idle      milliseconds since the last keyboard or mouse input
#   display.ps1 serve     one command per line on stdin, one line of JSON out
#
# A monitor turned off over DDC/CI (VCP 0xD6) stops answering, so DDC/CI
# can't wake it. Display sleep wakes any monitor that wakes on a signal.
param([Parameter(Position = 0)][string]$Command = 'idle')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Display {
  [StructLayout(LayoutKind.Sequential)] struct LastInput { public uint Size; public uint Time; }
  [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr result);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LastInput info);

  // WM_SYSCOMMAND / SC_MONITORPOWER to every top-level window, with
  // SMTO_ABORTIFHUNG so a hung window can't block the call.
  public static bool Off() {
    IntPtr result;
    SendMessageTimeout((IntPtr)0xffff, 0x0112, (IntPtr)0xF170, (IntPtr)2, 2, 2000, out result);
    return true;
  }

  // One pixel right and back: input that wakes the displays and leaves the
  // cursor where it was.
  public static bool On() {
    mouse_event(1, 1, 0, 0, UIntPtr.Zero);
    mouse_event(1, -1, 0, 0, UIntPtr.Zero);
    return true;
  }

  public static long Idle() {
    var info = new LastInput { Size = 8 };
    if (!GetLastInputInfo(ref info)) return -1;
    return (uint)Environment.TickCount - info.Time;
  }
}
'@

function Run([string]$cmd) {
  switch ($cmd) {
    'off' { return [Display]::Off() }
    'on' { return [Display]::On() }
    'idle' { return [Display]::Idle() }
    default { throw "Unknown command: $cmd" }
  }
}

if ($Command -eq 'serve') {
  while (($line = [Console]::In.ReadLine()) -ne $null) {
    $result = $null
    try { $result = Run $line.Trim() } catch { $result = $null }
    if ($result -eq $null) { [Console]::Out.WriteLine('null') }
    else { [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject $result)) }
  }
  return
}

Run $Command
