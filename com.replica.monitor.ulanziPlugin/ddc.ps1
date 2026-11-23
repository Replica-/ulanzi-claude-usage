# Read or switch a monitor's input over DDC/CI (VCP code 0x60). DDC/CI goes
# over the video cable, so it reaches a monitor that shows another input.
#
#   ddc.ps1 list                      every monitor, its input and the inputs it lists
#   ddc.ps1 get                       the input of the first monitor that answers
#   ddc.ps1 set 0x0F                  switch to an input
#   ddc.ps1 toggle 0x0F 0x10          switch to the second input from the first, else to the first
#   ddc.ps1 toggle 0x0F 0x10 -Monitor "MSI MPG 321URX QD-OLED"
#   ddc.ps1 serve                     one command per line on stdin, one line of JSON out
#
# Input values are hex. Without -Monitor, the first monitor that answers is
# used.
param(
  [Parameter(Position = 0)][string]$Command = 'list',
  [Parameter(Position = 1)][string]$First,
  [Parameter(Position = 2)][string]$Second,
  [string]$Monitor = ''
)

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class DdcMonitor {
  public string Name { get; set; }
  public int Input { get; set; }
  public string Caps { get; set; }
}

public static class Ddc {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  struct PM { public IntPtr Handle; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Name; }
  delegate bool EnumProc(IntPtr monitor, IntPtr dc, IntPtr rect, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, EnumProc proc, IntPtr data);
  [DllImport("dxva2.dll")] static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr monitor, out uint count);
  [DllImport("dxva2.dll")] static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr monitor, uint count, [Out] PM[] list);
  [DllImport("dxva2.dll")] static extern bool DestroyPhysicalMonitors(uint count, PM[] list);
  [DllImport("dxva2.dll")] static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h, byte code, IntPtr type, out uint current, out uint max);
  [DllImport("dxva2.dll")] static extern bool SetVCPFeature(IntPtr h, byte code, uint value);
  [DllImport("dxva2.dll")] static extern bool GetCapabilitiesStringLength(IntPtr h, out uint length);
  [DllImport("dxva2.dll")] static extern bool CapabilitiesRequestAndCapabilitiesReply(IntPtr h, StringBuilder caps, uint length);

  // The physical monitor handles are destroyed after each call, so a display
  // change never leaves one stale.
  static T Each<T>(Func<PM, T> visit) where T : class {
    var monitors = new List<IntPtr>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, dc, r, d) => { monitors.Add(m); return true; }, IntPtr.Zero);
    foreach (var monitor in monitors) {
      uint count;
      if (!GetNumberOfPhysicalMonitorsFromHMONITOR(monitor, out count) || count == 0) continue;
      var list = new PM[count];
      if (!GetPhysicalMonitorsFromHMONITOR(monitor, count, list)) continue;
      T found = null;
      try { foreach (var pm in list) { found = visit(pm); if (found != null) break; } }
      finally { DestroyPhysicalMonitors(count, list); }
      if (found != null) return found;
    }
    return null;
  }

  static int Read(IntPtr handle) {
    uint current, max;
    return GetVCPFeatureAndVCPFeatureReply(handle, 0x60, IntPtr.Zero, out current, out max) ? (int)(current & 0xFF) : -1;
  }

  static bool Matches(PM pm, string name) { return name == "" || pm.Name == name; }

  // The capabilities request takes a second or two per monitor.
  public static DdcMonitor[] List() {
    var all = new List<DdcMonitor>();
    Each<object>(pm => {
      var caps = "";
      uint length;
      if (GetCapabilitiesStringLength(pm.Handle, out length)) {
        var text = new StringBuilder((int)length);
        if (CapabilitiesRequestAndCapabilitiesReply(pm.Handle, text, length)) caps = text.ToString();
      }
      all.Add(new DdcMonitor { Name = pm.Name, Input = Read(pm.Handle), Caps = caps });
      return null;
    });
    return all.ToArray();
  }

  public static DdcMonitor Get(string name) {
    return Each(pm => {
      if (!Matches(pm, name)) return null;
      int input = Read(pm.Handle);
      return input < 0 ? null : new DdcMonitor { Name = pm.Name, Input = input, Caps = "" };
    });
  }

  public static DdcMonitor Set(string name, uint value) {
    return Each(pm => {
      if (!Matches(pm, name) || Read(pm.Handle) < 0) return null;
      return SetVCPFeature(pm.Handle, 0x60, value) ? new DdcMonitor { Name = pm.Name, Input = (int)value, Caps = "" } : null;
    });
  }

  // Switches to second from first, and to first from anything else.
  public static DdcMonitor Toggle(string name, uint first, uint second) {
    var now = Get(name);
    if (now == null) return null;
    return Set(now.Name, now.Input == first ? second : first);
  }
}
'@

# An input value is hex, with or without 0x: 0x10, 10 and 0x10 are the same.
function Value([string]$text) {
  return [Convert]::ToUInt32(($text -replace '^0[xX]', ''), 16)
}

function Run([string]$cmd, [string]$name, [string]$a, [string]$b) {
  switch ($cmd) {
    'list' { return [Ddc]::List() }
    'get' { return [Ddc]::Get($name) }
    'set' { return [Ddc]::Set($name, (Value $a)) }
    'toggle' { return [Ddc]::Toggle($name, (Value $a), (Value $b)) }
    default { throw "Unknown command: $cmd" }
  }
}

if ($Command -eq 'serve') {
  # One tab-separated command per line: list | get<TAB>monitor |
  # set<TAB>monitor<TAB>value. Each answer is one line of JSON, or null.
  while (($line = [Console]::In.ReadLine()) -ne $null) {
    $parts = $line.Split([char]9) + @('', '', '')
    $result = $null
    try { $result = Run $parts[0] $parts[1] $parts[2] $parts[3] } catch { $result = $null }
    if ($result -eq $null) { [Console]::Out.WriteLine('null') }
    else { [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 3 -InputObject $result)) }
  }
  return
}

$result = Run $Command $Monitor $First $Second
if ($result -eq $null) {
  Write-Error 'No monitor answered over DDC/CI. Check that DDC/CI is on in the monitor''s menu.'
  exit 1
}
$result | ForEach-Object { '{0}: input 0x{1:X2}' -f $_.Name, $_.Input }
