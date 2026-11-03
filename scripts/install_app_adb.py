"""Install Mins Reader on an emulator (direct TCP) or a USB phone (Windows WinUSB) without adb.exe.

Used where adb.exe transfers are blocked (for example `adb install` failing with
"connection reset"). Talks the ADB protocol itself through adb-shell 0.4.4:

    python -m pip install adb-shell==0.4.4
    python scripts/install_app_adb.py            # newest APK, emulator at 127.0.0.1:5555
    python scripts/install_app_adb.py --usb      # USB phone with USB debugging on
    python scripts/install_app_adb.py --apk build/MinsReader_ver0.1.11.apk
    python scripts/install_app_adb.py --check    # show the selected APK and transport only

Settings (environment): MINS_APK, MINS_ADB_TRANSPORT (tcp|usb), MINS_ADB_HOST, MINS_ADB_PORT
(an emulator's ADB port is its console port + 1: 5555 for emulator-5554), MINS_ADB_KEY
(default ~/.android/adbkey), MINS_BOOT_TIMEOUT (seconds, default 180).
The app is replaced in place (pm install -r) and never uninstalled, so reading data is kept;
an APK signed with another key (debug over release) is refused by Android and reported.
Adapted from the YTHelper project's scripts/install_app.py.
"""
import argparse
import ctypes
import ctypes.wintypes as wt
import json
import os
from pathlib import Path
import re
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGE = 'com.minsapps.reader'
ACTIVITY = f'{PACKAGE}/.MainActivity'
REMOTE_APK = '/data/local/tmp/mins-reader-install.apk'
DEBUG_OUTPUT = PROJECT_ROOT / 'android/app/build/outputs/apk/debug'
RELEASE_DIR = PROJECT_ROOT / 'build'


class _GUID(ctypes.Structure):
    _fields_ = [
        ('Data1', wt.DWORD),
        ('Data2', wt.WORD),
        ('Data3', wt.WORD),
        ('Data4', wt.BYTE * 8),
    ]


class _USB_INTERFACE_DESCRIPTOR(ctypes.Structure):
    _fields_ = [
        ('bLength', wt.BYTE),
        ('bDescriptorType', wt.BYTE),
        ('bInterfaceNumber', wt.BYTE),
        ('bAlternateSetting', wt.BYTE),
        ('bNumEndpoints', wt.BYTE),
        ('bInterfaceClass', wt.BYTE),
        ('bInterfaceSubClass', wt.BYTE),
        ('bInterfaceProtocol', wt.BYTE),
        ('iInterface', wt.BYTE),
    ]


class _WINUSB_PIPE_INFORMATION(ctypes.Structure):
    _fields_ = [
        ('PipeType', wt.ULONG),
        ('PipeId', ctypes.c_ubyte),
        ('MaximumPacketSize', wt.USHORT),
        ('Interval', ctypes.c_ubyte),
    ]


def find_winusb_adb_path():
    if os.name != 'nt':
        return None
    cfgmgr32 = ctypes.WinDLL('cfgmgr32', use_last_error=True)
    # Android ADB interface class GUID.
    guid = _GUID(
        0xF72FE0D4,
        0xCBCB,
        0x407D,
        (wt.BYTE * 8)(0x88, 0x14, 0x9E, 0xD6, 0x73, 0xD0, 0xDD, 0x6B),
    )
    buf_len = wt.ULONG(0)
    if cfgmgr32.CM_Get_Device_Interface_List_SizeW(ctypes.byref(buf_len), ctypes.byref(guid), None, 0) != 0:
        return None
    if buf_len.value <= 1:
        return None
    buf = ctypes.create_unicode_buffer(buf_len.value)
    if cfgmgr32.CM_Get_Device_Interface_ListW(ctypes.byref(guid), None, buf, buf_len.value, 0) != 0:
        return None
    return buf.value or None


def create_winusb_device(default_transport_timeout_s=60):
    from adb_shell.adb_device import AdbDevice
    from adb_shell.transport.base_transport import BaseTransport

    class WinUsbTransport(BaseTransport):
        """Direct Windows WinUSB transport for composite Android USB devices."""

        def __init__(self):
            self.kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
            self.winusb = ctypes.WinDLL('winusb', use_last_error=True)
            self.hFile = None
            self.hWinUsb = None
            self.in_pipe = None
            self.out_pipe = None
            self.max_packet = 512
            self.rx_buf = bytearray()

        def connect(self, transport_timeout_s):
            self.close()
            path = find_winusb_adb_path()
            if not path:
                raise RuntimeError('No USB ADB device found. Enable USB debugging on your phone.')
            self.hFile = self.kernel32.CreateFileW(
                path,
                0x80000000 | 0x40000000,
                1 | 2,
                None,
                3,
                0x40000000,
                None,
            )
            if self.hFile in (-1, 0xFFFFFFFFFFFFFFFF, None):
                raise RuntimeError(f'CreateFileW failed for USB ADB device (err={ctypes.get_last_error()})')
            self.hWinUsb = wt.HANDLE()
            if not self.winusb.WinUsb_Initialize(wt.HANDLE(self.hFile), ctypes.byref(self.hWinUsb)):
                err = ctypes.get_last_error()
                self.close()
                raise RuntimeError(f'WinUsb_Initialize failed (err={err})')
            iface = _USB_INTERFACE_DESCRIPTOR()
            self.winusb.WinUsb_QueryInterfaceSettings(self.hWinUsb, 0, ctypes.byref(iface))
            for i in range(iface.bNumEndpoints):
                pipe = _WINUSB_PIPE_INFORMATION()
                self.winusb.WinUsb_QueryPipe(self.hWinUsb, 0, i, ctypes.byref(pipe))
                if pipe.PipeId & 0x80:
                    self.in_pipe = pipe.PipeId
                    if pipe.MaximumPacketSize:
                        self.max_packet = int(pipe.MaximumPacketSize)
                else:
                    self.out_pipe = pipe.PipeId
            if self.in_pipe is None or self.out_pipe is None:
                self.close()
                raise RuntimeError('USB ADB bulk IN/OUT endpoints not found')
            # Drain any leftover bytes from an earlier interrupted session
            ms = wt.ULONG(150)
            self.winusb.WinUsb_SetPipePolicy(
                self.hWinUsb, ctypes.c_ubyte(self.in_pipe), wt.ULONG(3), wt.ULONG(4), ctypes.byref(ms)
            )
            tmp = (ctypes.c_ubyte * 4096)()
            tr = wt.ULONG(0)
            while (
                self.winusb.WinUsb_ReadPipe(
                    self.hWinUsb, ctypes.c_ubyte(self.in_pipe), tmp, wt.ULONG(4096), ctypes.byref(tr), None
                )
                and tr.value > 0
            ):
                pass
            self.rx_buf.clear()

        def _set_timeout(self, pipe_id, timeout_s):
            ms = wt.ULONG(int((timeout_s or default_transport_timeout_s or 60) * 1000))
            self.winusb.WinUsb_SetPipePolicy(
                self.hWinUsb, ctypes.c_ubyte(pipe_id), wt.ULONG(3), wt.ULONG(4), ctypes.byref(ms)
            )

        def bulk_read(self, numbytes, transport_timeout_s):
            if len(self.rx_buf) >= numbytes:
                out = bytes(self.rx_buf[:numbytes])
                del self.rx_buf[:numbytes]
                return out
            self._set_timeout(self.in_pipe, transport_timeout_s)
            pkt = max(self.max_packet, 512)
            read_len = max(4096, ((numbytes + pkt - 1) // pkt) * pkt)
            buf = (ctypes.c_ubyte * read_len)()
            transferred = wt.ULONG(0)
            ok = self.winusb.WinUsb_ReadPipe(
                self.hWinUsb,
                ctypes.c_ubyte(self.in_pipe),
                buf,
                wt.ULONG(read_len),
                ctypes.byref(transferred),
                None,
            )
            if not ok:
                raise RuntimeError(f'WinUsb_ReadPipe failed (err={ctypes.get_last_error()})')
            self.rx_buf.extend(buf[: transferred.value])
            out = bytes(self.rx_buf[:numbytes])
            del self.rx_buf[:numbytes]
            return out

        def bulk_write(self, data, transport_timeout_s):
            self._set_timeout(self.out_pipe, transport_timeout_s)
            buf = (ctypes.c_ubyte * len(data)).from_buffer_copy(data)
            transferred = wt.ULONG(0)
            ok = self.winusb.WinUsb_WritePipe(
                self.hWinUsb,
                ctypes.c_ubyte(self.out_pipe),
                buf,
                wt.ULONG(len(data)),
                ctypes.byref(transferred),
                None,
            )
            if not ok:
                raise RuntimeError(f'WinUsb_WritePipe failed (err={ctypes.get_last_error()})')
            return transferred.value

        def close(self):
            self.rx_buf.clear()
            if self.hWinUsb:
                try:
                    self.winusb.WinUsb_Free(self.hWinUsb)
                except Exception:
                    pass
                self.hWinUsb = None
            if self.hFile not in (None, -1, 0xFFFFFFFFFFFFFFFF):
                try:
                    self.kernel32.CloseHandle(wt.HANDLE(self.hFile))
                except Exception:
                    pass
                self.hFile = None

    return AdbDevice(WinUsbTransport(), default_transport_timeout_s=default_transport_timeout_s)


def _version_key(path):
    match = re.fullmatch(r'MinsReader_ver(\d+)\.(\d+)\.(\d+)\.apk', path.name)
    return tuple(int(part) for part in match.groups()) if match else None


def _debug_apk():
    metadata_path = DEBUG_OUTPUT / 'output-metadata.json'
    if not metadata_path.is_file():
        return None
    elements = json.loads(metadata_path.read_text(encoding='utf-8-sig')).get('elements', [])
    if len(elements) != 1:
        raise RuntimeError('Multiple or missing debug APK outputs. Select one with --apk.')
    apk = DEBUG_OUTPUT / elements[0]['outputFile']
    return apk if apk.is_file() else None


def _release_apk():
    releases = [path for path in RELEASE_DIR.glob('MinsReader_ver*.apk') if _version_key(path)]
    return max(releases, key=_version_key) if releases else None


# --apk or MINS_APK; otherwise the newer of the Gradle debug output (gradlew assembleDebug) and the
# highest build/MinsReader_ver<version>.apk (npm.cmd run android:apk).
def resolve_apk(explicit=None):
    value = explicit or os.environ.get('MINS_APK')
    if value:
        apk = Path(value).expanduser().resolve()
        if not apk.is_file():
            raise RuntimeError(f'APK not found: {apk}')
        return apk
    candidates = [apk for apk in (_debug_apk(), _release_apk()) if apk]
    if not candidates:
        raise RuntimeError('No APK found. Run npm.cmd run android:apk (or gradlew assembleDebug), or pass --apk.')
    return max(candidates, key=lambda apk: apk.stat().st_mtime).resolve()


def load_signer(signer_class):
    explicit = os.environ.get('MINS_ADB_KEY')
    key_path = Path(explicit).expanduser() if explicit else Path.home() / '.android/adbkey'
    if not key_path.is_file():
        if explicit:
            raise RuntimeError(f'ADB key not found: {key_path}')
        return None  # Existing emulators may accept connections without RSA authentication.
    pub_path = Path(str(key_path) + '.pub')
    public_key = pub_path.read_text(encoding='utf-8') if pub_path.is_file() else None
    return signer_class(public_key, key_path.read_text(encoding='utf-8'))


def wait_until_ready(device, signer, timeout):
    deadline = time.monotonic() + timeout
    last_error = 'Device not connected'
    while time.monotonic() < deadline:
        try:
            connected = device.connect(rsa_keys=[signer] if signer else [], auth_timeout_s=5)
            if not connected:
                raise RuntimeError('Device did not accept the connection')
            break
        except Exception as error:
            last_error = str(error)
            device.close()
            time.sleep(2)
    else:
        raise RuntimeError(f'Connection timed out: {last_error}')
    while time.monotonic() < deadline:
        try:
            booted = device.shell('getprop sys.boot_completed').strip() == '1'
            package_manager = device.shell('pm path android')
            if booted and 'package:' in package_manager:
                return
        except Exception as error:
            last_error = str(error)
        time.sleep(2)
    raise RuntimeError(f'Android boot/package manager timed out: {last_error}')


def install_and_launch(device, apk, launch=True):
    try:
        print(f'[INFO] Pushing {apk} ({apk.stat().st_size / 1024 / 1024:.1f} MB)')
        device.push(str(apk), REMOTE_APK, read_timeout_s=120)
        print('[INFO] Installing APK via Package Manager...')
        result = device.shell(f'pm install -t -r {REMOTE_APK}', read_timeout_s=180).strip()
        if 'Success' not in result.splitlines():
            if 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' in result:
                result += (f'\nThe installed {PACKAGE} is signed with another key. It was not removed;'
                           ' uninstall it yourself (this deletes its reading data) or install an APK with the same key.')
            raise RuntimeError(f'APK installation failed: {result}')
        print('[INFO] Installed.')
        if launch:
            print('[INFO] Launching MainActivity...')
            result = device.shell(f'am start -W -n {ACTIVITY}', read_timeout_s=60).strip()
            if 'Error' in result or 'Exception' in result:
                raise RuntimeError(f'App launch failed: {result}')
            print(result)
    finally:
        try:
            device.shell(f'rm -f {REMOTE_APK}', read_timeout_s=30)
        except Exception:
            pass


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--apk', help='APK file; default: MINS_APK, else the newest debug or release APK')
    parser.add_argument('--usb', action='store_true', help='Install to a USB-connected phone via WinUSB (no adb.exe)')
    parser.add_argument('--tcp', action='store_true', help='Install via direct TCP (emulator/network)')
    parser.add_argument('--no-launch', action='store_true', help='Install only, do not start the app')
    parser.add_argument('--check', action='store_true', help='Show settings and dependencies without connecting')
    args = parser.parse_args(argv)
    try:
        apk = resolve_apk(args.apk)
        transport = os.environ.get('MINS_ADB_TRANSPORT', 'tcp').lower()
        use_usb = args.usb or (not args.tcp and (transport == 'usb' or bool(find_winusb_adb_path())))
        timeout = int(os.environ.get('MINS_BOOT_TIMEOUT', '180'))
        if timeout <= 0:
            raise ValueError('Set a positive boot timeout.')
        try:
            from adb_shell.adb_device import AdbDeviceTcp
            from adb_shell.auth.sign_pythonrsa import PythonRSASigner
        except ImportError as error:
            raise RuntimeError('Dependencies missing. Run: python -m pip install adb-shell==0.4.4') from error
        signer = load_signer(PythonRSASigner)
        if use_usb:
            usb_path = find_winusb_adb_path()
            print(f'[INFO] Direct WinUSB phone: {usb_path or "searching..."}; APK: {apk}; RSA key: {"loaded" if signer else "not present"}')
            if args.check:
                return 0
            device = create_winusb_device(default_transport_timeout_s=60)
        else:
            host = os.environ.get('MINS_ADB_HOST', '127.0.0.1')
            port = int(os.environ.get('MINS_ADB_PORT', '5555'))
            if not host.strip() or not 1 <= port <= 65535:
                raise ValueError('Set a nonempty TCP host and a port 1..65535.')
            print(f'[INFO] Direct TCP: {host}:{port}; APK: {apk}; RSA key: {"loaded" if signer else "not present"}')
            if args.check:
                return 0
            device = AdbDeviceTcp(host, port, default_transport_timeout_s=60)
        try:
            wait_until_ready(device, signer, timeout)
            install_and_launch(device, apk, launch=not args.no_launch)
        finally:
            device.close()
        return 0
    except Exception as error:
        print(f'[ERROR] {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    sys.exit(main())
