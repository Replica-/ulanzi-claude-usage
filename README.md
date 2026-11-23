# Claude usage on a Ulanzi Deck

Ulanzi Studio plugins for a Ulanzi Deck. The main one shows your Claude plan
usage on a deck key: the 5-hour session limit and the weekly limit, each with a
percentage, a bar, and a countdown to the reset.

The repo also holds three unrelated plugins:

| Folder | Shows up in Ulanzi Studio as | What it does |
| --- | --- | --- |
| `com.replica.claudeusage.ulanziPlugin` | **Claude Usage** | Claude plan usage |
| `com.replica.speakers.ulanziPlugin` | **Speakers** | Volume dials ([Speaker dials](#speaker-dials)) |
| `com.replica.system.ulanziPlugin` | **System** | CPU, GPU, RAM and disk keys ([System keys](#system-keys)) |
| `com.replica.monitor.ulanziPlugin` | **Monitor** | A key that switches the monitor's input ([Monitor input key](#monitor-input-key)) |

![Key showing 5H 42% and 7D 87%](docs/key.png)

Bars are green under 50%, amber from 50%, and red from 80%. Pressing the key
checks usage right away and shows how old the numbers are.

## Requirements

All plugins need:

- Windows 10 or 11
- Ulanzi Studio 6.1 or later, with a Ulanzi Deck (tested on the D200)

Some need more:

- **Claude Usage**: the Claude Code extension for VS Code, signed in with a
  Claude Pro or Max plan.
- **Speakers**: rear and app volume need NirSoft
  [SoundVolumeView](https://www.nirsoft.net/utils/sound_volume_view.html)
  (see [Speaker dials](#speaker-dials)).
- **System**: the GPU key needs an NVIDIA graphics card and driver.
- **Monitor**: a monitor with DDC/CI turned on in its menu.

## Install

The steps are the same for each plugin. Install only the ones you want.

1. Download the repo: on GitHub, click **Code → Download ZIP** and unzip it, or
   run `git clone https://github.com/Replica-/ulanzi-claude-usage.git`.
2. Quit Ulanzi Studio, including its icon in the system tray.
3. Open the plugins folder: press **Win+R**, paste
   `%APPDATA%\Ulanzi\UlanziDeck\Plugins` and press Enter.
4. Copy the plugin's whole folder (for example
   `com.replica.claudeusage.ulanziPlugin`) into that folder. Keep the folder
   name as it is.
5. Start Ulanzi Studio. The plugin appears in the action list on the right.
6. Drag an action onto a key or dial:
   - **Claude Usage → Usage Limits** onto a key.
   - **Speakers → Full Volume**, **Rear Volume** or **Application Volume**
     onto a dial.
   - **System → CPU**, **GPU**, **RAM** or **Disk** onto a key. For a Disk key,
     select it and choose the drive under **Drive** in its settings.
   - **Monitor → Switch Input** onto a key. Select it and pick the two inputs
     in its settings.

No `npm install` is needed: each plugin includes its one dependency (`ws`), and
Ulanzi Studio supplies Node.js.

### Updating

Quit Ulanzi Studio, replace the plugin's folder with the new one, and start
Ulanzi Studio again. Keys you have already placed keep their settings.

### Uninstalling

Remove the plugin's keys in Ulanzi Studio, quit it, and delete the plugin's
folder from `%APPDATA%\Ulanzi\UlanziDeck\Plugins`.

## How it works

Claude Code keeps a copy of your usage in `~/.claude.json`
(`cachedUsageUtilization`). The plugin reads that file and redraws the key
whenever it changes.

Claude Code only refreshes that copy when it looks up your usage, for example
at the start of a session. To keep the key current, the plugin runs the Claude
Code program bundled with the VS Code extension every 5 minutes:

```
claude.exe -p --no-session-persistence /usage
```

`/usage` is a built-in command, so this sends no prompt to the model and uses
none of your quota. `--no-session-persistence` keeps these checks out of your
session history. Checks only run while the key is on screen. To change the
interval, edit `USAGE_CHECK_MS` in `plugin/app.js`.

## Privacy

- The plugin has no network code. Its only connection is the local WebSocket to
  Ulanzi Studio on 127.0.0.1.
- It never reads your Claude login or token.
- The periodic `/usage` check is Claude Code itself asking Anthropic for your
  usage, the same as typing `/usage` in the Claude panel.

## Caveats

`cachedUsageUtilization` and the `/usage` output are internal to Claude Code
and not a documented interface, so a Claude Code update could change them and
break the plugin.

The key image is drawn by the plugin itself (a small PNG encoder and a 5×7
pixel font in `plugin/render.js`), so it needs no image libraries.

## Credits

- `libs/node/` is the Node.js helper library from Ulanzi's plugin SDK, copied
  unchanged.
- `node_modules/ws` is [ws](https://github.com/websockets/ws), MIT licensed.

## Speaker dials

`com.replica.speakers.ulanziPlugin` adds three dials under **Speakers** (see
[Install](#install)):

<img src="docs/volume.png" width="120" alt="Full Volume dial at 40%"> <img src="docs/rear.png" width="120" alt="Rear Volume dial at 64%"> <img src="docs/app-volume.png" width="120" alt="Application Volume dial showing SPOTIFY at 72%">

- **Full Volume**: the normal Windows volume. The dial presses the keyboard
  volume keys (through one hidden PowerShell process), so Windows changes the
  volume and shows its own volume pop-up.
- **Rear Volume**: chosen channels of an output device. By default it uses
  rear left and rear right (channels 4 and 5) of the default output device,
  and shows REAR. To change that, select the dial in Ulanzi Studio and use its
  settings:
  - **Label**: the name shown on the dial (letters, digits and a little
    punctuation, up to 12 characters).
  - **Device**: the output device; the list shows each one's channel count.
  - **Channels**: tick the channels to change. They're named for the device's
    speaker setup (for example 5.1 or 7.1).

  The dial changes every ticked channel by the same step and shows the level of
  the first. Each Rear dial has its own settings.
- **Application Volume**: every instance of the app in front. The dial shows
  the app's name, or NO AUDIO when the app has no sound session.

Each click changes the volume by 2%, and the dial shows the level. Pressing a
dial re-reads it.

Rear and app volume use NirSoft
[SoundVolumeView](https://www.nirsoft.net/utils/sound_volume_view.html).
Download it and put `SoundVolumeView.exe` in the plugin's folder
(`%APPDATA%\Ulanzi\UlanziDeck\Plugins\com.replica.speakers.ulanziPlugin`). The
plugin also finds it in `C:\development\sound\` or on your PATH. The step and
the Rear dial's defaults are constants at the top of `plugin/volume.js`.

## System keys

`com.replica.system.ulanziPlugin` adds four keys under **System** (see
[Install](#install)):

<img src="docs/cpu.png" width="120" alt="CPU key at 7%"> <img src="docs/gpu.png" width="120" alt="GPU key at 23%, 46C"> <img src="docs/ram.png" width="120" alt="RAM key at 52%, 16.5/32G"> <img src="docs/disk.png" width="120" alt="Disk C key at 94%, 52G free">

- **CPU**: CPU usage, measured by the plugin from Windows' CPU counters.
- **GPU**: NVIDIA GPU usage, with the temperature underneath, from
  `nvidia-smi` (installed with the NVIDIA driver).
- **RAM**: memory in use, with used and total GB underneath.
- **Disk**: space used on a drive, with the free space underneath. Choose the
  drive in the key's settings in Ulanzi Studio (C by default); each Disk key
  can show a different drive.

They refresh every 2 seconds while on screen, and the bar turns amber from 50%
and red from 80%.

## Monitor input key

`com.replica.monitor.ulanziPlugin` adds **Monitor → Switch Input** (see
[Install](#install)). Pressing the key switches the monitor between two
inputs, and the key shows which one is on.

<img src="docs/input-pc.png" width="120" alt="Input key showing PC"> <img src="docs/input-usbc.png" width="120" alt="Input key showing USB-C">

Select the key in Ulanzi Studio to set it up:

- **Monitor**: the monitor to switch, or the first one that answers.
- **Input A** and **Input B**: the two inputs to switch between. The list
  shows the inputs that the monitor reports, and marks the one that's on.
- A **label** for each input, shown on the key (up to 8 letters or digits).

A press switches to B from A, and to A from any other input. The key reads
the input back every 3 seconds, so it follows a switch made with the
monitor's buttons too. An input that is neither A nor B shows in amber.

The plugin talks to the monitor over DDC/CI, the standard control channel
in the video cable (DisplayPort or HDMI). Turn on **DDC/CI** in the
monitor's on-screen menu if the key shows `--`.

### Switching the KVM on an MSI monitor

Many MSI monitors have a built-in KVM: the keyboard and mouse plugged into
the monitor's USB ports follow the input on screen. Switching normally
takes the monitor's joystick and menu. This key, or the script below, does
it in one press instead.

DDC/CI goes over the video cable, so it still reaches the monitor while it
shows the other computer. The PC can switch to the other input and back
again on its own, and the monitor's USB ports move with the picture.

On an MSI MPG 321URX QD-OLED, connected to the PC over DisplayPort:

| Value | Input |
| --- | --- |
| `0x0F` | DisplayPort (the PC) |
| `0x10` | USB-C. The DDC/CI standard calls this value DisplayPort 2. |
| `0x11` | HDMI 1 |
| `0x12` | HDMI 2 |

Other models can use other values. `ddc.ps1 list` shows the values that a
monitor reports, and the input it's on.

Keep the keyboard that triggers the switch on the PC, not on the monitor's
USB ports. A keyboard on the monitor's ports goes to the other computer
with the picture, so it can't switch back.

### Without a Ulanzi Deck

The switch is a PowerShell script, `ddc.ps1`, in the plugin's folder. It
runs on its own, so any macro tool, keyboard macro key or desktop shortcut
can switch inputs:

```
powershell -ExecutionPolicy Bypass -File ddc.ps1 list
powershell -ExecutionPolicy Bypass -File ddc.ps1 get
powershell -ExecutionPolicy Bypass -File ddc.ps1 set 0F
powershell -ExecutionPolicy Bypass -File ddc.ps1 toggle 0F 10
powershell -ExecutionPolicy Bypass -File ddc.ps1 toggle 0F 10 -Monitor "MSI MPG 321URX QD-OLED"
```

Input values are hex. `toggle` switches to the second input from the first,
and to the first from any other input.

`toggle-input.cmd`, next to the script, runs `toggle 0F 10` with no window.
Point a macro or a shortcut at it, and edit the two values to suit your
monitor. For a keyboard shortcut, right-click a desktop shortcut to the file,
choose **Properties**, and set **Shortcut key**.
